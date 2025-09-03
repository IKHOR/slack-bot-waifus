#!/usr/bin/env python3
"""
Local testing script for Research Chan bot
Simulates the bot's responses without using Slack
"""

import os
import json
import sys
from datetime import datetime
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
RESEARCH_BOT_TOKEN = os.getenv('RESEARCH_BOT_TOKEN')
RESEARCH_LIST_ID = os.getenv('RESEARCH_LIST_ID')
RESEARCH_CHANNEL_ID = os.getenv('RESEARCH_CHANNEL_ID')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
GOOGLE_MODEL = os.getenv('RESEARCH_GOOGLE_MODEL', 'gemini-1.5-pro')
TIMEZONE = os.getenv('RESEARCH_TIMEZONE', 'Asia/Tokyo')

# Initialize clients
slack = WebClient(token=RESEARCH_BOT_TOKEN)
genai.configure(api_key=GOOGLE_API_KEY)

# Field mappings (from events.mjs)
STATUS_OPTIONS = {
    "Opt2AUH34OG": "ToDo",
    "Opt62NHHN5C": "ToDo", 
    "OptHSJVP60E": "In Progress",
    "OptHX1KN4IP": "Deprecated",
    "OptZHYHCA4A": "Backlog",
    "Opt38B8RWRR": "Complete",
}

PRIORITY_OPTIONS_MAP = {
    "Opt0183CXDH": "P0",
    "Opt4GBWBKZB": "P1",
    "OptGESIX7LE": "P2",
    "Opt24AKKH4V": "P3",
}

PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4, "None": 99}

# User ID to name mapping (add more as needed)
USER_NAMES = {
    "U06L088EW7K": "Joao",
    "U06K8F0F1RC": "Kytra", 
    "U09BTLXG89G": "Ryo",
    "U06KJLR4GBF": "Jackson",
    "U06LABYK33J": "Khai",
    "U0798RS2ESX": "Kijai",
    "U079Z6D4YFJ": "Todd",
    "U07584FHQMN": "Kush",
}

def get_user_name(user_id):
    """Get user name from ID, with fallback to ID if not found"""
    return USER_NAMES.get(user_id, f"<@{user_id}>") if user_id else "Unassigned"

def fetch_list_items(list_id):
    """Fetch items from Slack List"""
    try:
        response = slack.api_call("slackLists.items.list", params={
            "list_id": list_id,
            "limit": 200
        })
        if response.get("ok"):
            return response.get("items", [])
        else:
            print(f"API Error: {response.get('error')}")
            return []
    except Exception as e:
        print(f"Error fetching list: {e}")
        return []

def parse_list_item(raw_item):
    """Parse a raw list item into structured data"""
    fields = raw_item.get("fields", [])
    
    title = "Untitled"
    assignee_id = None
    due = None
    status = "Unknown"
    priority = "None"
    notes = ""
    
    for field in fields:
        key = field.get("key", "")
        
        # Title/name
        if key in ["name", "title"] and field.get("text"):
            title = field["text"]
        
        # Assignee
        if key == "todo_assignee" and field.get("user"):
            users = field["user"]
            if isinstance(users, list) and users:
                assignee_id = users[0]
        
        # Due date
        if key == "todo_due_date" and field.get("value"):
            due = field["value"]
        
        # Status
        if key == "Col093T8A25LG" and field.get("value"):
            status = STATUS_OPTIONS.get(field["value"], status)
        
        # Priority
        if key == "Col08V4T02P5Y" and field.get("value"):
            priority = PRIORITY_OPTIONS_MAP.get(field["value"], priority)
        
        # Notes/description - Check the specific column ID found in debug output
        # Col08V5C24K1S seems to be the description field based on the raw data
        if key == "Col08V5C24K1S" and field.get("text"):
            notes = field["text"]
    
    # Extract priority from title if present
    import re
    priority_match = re.search(r'\b[Pp]([0-4])\b', title)
    if priority_match:
        priority = f"P{priority_match.group(1)}"
        title = re.sub(r'^\s*[Pp][0-4]\s*:?\s*', '', title)
    
    return {
        "id": raw_item.get("id"),
        "title": title,
        "assignee_id": assignee_id,
        "due": due,
        "status": status,
        "priority": priority,
        "notes": notes,
        "raw": raw_item  # Keep raw data for debugging
    }

def filter_relevant(items):
    """Filter for ToDo and In Progress items"""
    return [item for item in items if item["status"] in ["ToDo", "In Progress"]]

def build_tasks_context(items, max_items=80):
    """Build context string for LLM"""
    # Sort by priority
    sorted_items = sorted(items, key=lambda x: PRIORITY_ORDER.get(x["priority"], 99))
    trimmed = sorted_items[:max_items]
    
    lines = []
    for item in trimmed:
        assignee = get_user_name(item["assignee_id"])
        due_text = item["due"] if item["due"] else "no due date"
        pri = f"[{item['priority']}] " if item["priority"] != "None" else ""
        
        # Truncate notes if too long, but show more than before
        notes = ""
        if item["notes"]:
            # Remove excessive whitespace and newlines for compact display
            clean_notes = " ".join(item["notes"].split())
            if len(clean_notes) > 200:
                notes = f"\n   Details: {clean_notes[:200]}..."
            else:
                notes = f"\n   Details: {clean_notes}"
        
        line = f"- {pri}{assignee} • {item['title']} (Due: {due_text}){notes}"
        lines.append(line)
    
    return "\n".join(lines)

def get_llm_response(user_message, tasks_context):
    """Get response from Google Gemini"""
    system_prompt = os.getenv('RESEARCH_SYSTEM_PROMPT', 
        "You are Research Chan, a friendly, concise R&D teammate. Be upbeat but efficient, "
        "answer in 3–6 sentences max, suggest concrete next steps, and use Slack-friendly "
        "formatting (bullets, short lines). Keep answers grounded in the conversation context.")
    
    if tasks_context:
        system_prompt += f"\n\nCurrent tasks (ToDo/In Progress):\n{tasks_context}"
    
    try:
        # Use the default model name if env var is not set properly
        model_name = GOOGLE_MODEL if GOOGLE_MODEL and not GOOGLE_MODEL.startswith('gemini') else 'gemini-1.5-pro'
        model = genai.GenerativeModel('gemini-1.5-pro')  # Force to working model
        response = model.generate_content(
            f"{system_prompt}\n\nUser: {user_message}\n\nAssistant:",
            generation_config=genai.types.GenerationConfig(
                temperature=0.4,
                max_output_tokens=600,
            )
        )
        return response.text
    except Exception as e:
        return f"LLM Error: {e}"

def debug_mode():
    """Show raw list data for debugging"""
    print("\n=== FETCHING RAW LIST DATA ===\n")
    items = fetch_list_items(RESEARCH_LIST_ID)
    
    if not items:
        print("No items found!")
        return
    
    print(f"Found {len(items)} total items\n")
    
    # Show first item in detail
    print("=== FIRST ITEM (RAW) ===")
    print(json.dumps(items[0], indent=2))
    
    # Parse all items
    parsed = [parse_list_item(item) for item in items]
    relevant = filter_relevant(parsed)
    
    print(f"\n=== PARSED SUMMARY ===")
    print(f"Total items: {len(items)}")
    print(f"Relevant (ToDo/In Progress): {len(relevant)}")
    
    # Show status distribution
    status_counts = {}
    for item in parsed:
        status = item["status"]
        status_counts[status] = status_counts.get(status, 0) + 1
    print("\nStatus distribution:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count}")
    
    # Show priority distribution
    priority_counts = {}
    for item in relevant:
        priority = item["priority"]
        priority_counts[priority] = priority_counts.get(priority, 0) + 1
    print("\nPriority distribution (relevant items):")
    for priority in ["P0", "P1", "P2", "P3", "P4", "None"]:
        if priority in priority_counts:
            print(f"  {priority}: {priority_counts[priority]}")
    
    # Show first few parsed items
    print("\n=== FIRST 3 RELEVANT ITEMS (PARSED) ===")
    for item in relevant[:3]:
        print(f"\nTitle: {item['title']}")
        print(f"Status: {item['status']}")
        print(f"Priority: {item['priority']}")
        print(f"Assignee: {item['assignee_id'] or 'None'}")
        print(f"Due: {item['due'] or 'None'}")
        if item['notes']:
            print(f"Notes: {item['notes'][:100]}...")

def interactive_mode():
    """Interactive chat mode"""
    print("\n=== RESEARCH CHAN LOCAL TESTER ===")
    print("Type 'debug' to see raw data, 'quit' to exit\n")
    
    while True:
        user_input = input("\nYou: ").strip()
        
        if user_input.lower() == 'quit':
            break
        elif user_input.lower() == 'debug':
            debug_mode()
            continue
        elif not user_input:
            continue
        
        # Fetch current tasks
        print("\n[Fetching list items...]")
        raw_items = fetch_list_items(RESEARCH_LIST_ID)
        parsed_items = [parse_list_item(item) for item in raw_items]
        relevant_items = filter_relevant(parsed_items)
        
        print(f"[Found {len(relevant_items)} relevant tasks]")
        
        # Build context
        tasks_context = build_tasks_context(relevant_items)
        
        # Get LLM response
        print("[Getting LLM response...]")
        response = get_llm_response(user_input, tasks_context)
        
        print(f"\nResearch Chan: {response}")
        
        # Optional: Show context being used
        show_context = input("\nShow task context? (y/n): ").strip().lower()
        if show_context == 'y':
            print("\n=== TASK CONTEXT SENT TO LLM ===")
            print(tasks_context)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "debug":
        debug_mode()
    else:
        interactive_mode()