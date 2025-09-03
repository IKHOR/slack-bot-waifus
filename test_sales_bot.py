#!/usr/bin/env python3
"""
Test script for Sales Chan daily update
Run this locally to test the formatting without posting to Slack
"""

import os
import json
from datetime import datetime, timedelta
from slack_sdk import WebClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
SALES_BOT_TOKEN = os.getenv('SALES_BOT_TOKEN')
SALES_LIST_ID = os.getenv('SALES_LIST_ID')
SALES_CHANNEL_ID = os.getenv('SALES_CHANNEL_ID')
TIMEZONE = os.getenv('SALES_TIMEZONE', 'Asia/Tokyo')

# Initialize Slack client
slack = WebClient(token=SALES_BOT_TOKEN)

# User ID to name mapping for Sales team
USER_NAMES = {
    "U06LABYENC8": "Ko",
    "U07H83TA3K7": "Shru", 
    "U079Z6D4YFJ": "Todd",
    "U06LABYK33J": "Khai",
    "U06KJLR4GBF": "Jackson",
    "U07F13STQDA": "Aki",
    "U08E2DPLLN5": "Hibari",
    "U0737DC9L2G": "Someone",  # Update with actual name
}

# Field mappings (from sales daily_update.mjs)
STATUS_OPTIONS = {
    "OptSARM6TJH": "Contact Sent",
    "OptS0N9KVH3": "Deal",
    "OptS4HEYP17": "Future",
    "OptS4Z99KWV": "In Convo",
    "OptSBP1TU1K": "Meeting",
    "OptSCP08V28": "ToDo",
    "OptSD8K3H3C": "Workshop",
    "OptSDBSH91B": "Intro Made",
    "OptSFK2GLEP": "Workshop Complete",
    "OptVMB3ZE63": "Dead Lead",
    "OptVN8M5XLE": "Deal Complete",
}

PRIORITY_OPTIONS = {
    "Opt00QNVMNR": "P0",
    "Opt4AK2ZJ7N": "P1",
    "Opt7LDMN1CG": "P2",
    "OptLCVQGFRH": "P3",
}

def fetch_list_items():
    """Fetch items from Slack List"""
    try:
        response = slack.api_call("slackLists.items.list", params={
            "list_id": SALES_LIST_ID,
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
    """Parse a raw list item"""
    fields = raw_item.get("fields", [])
    
    title = "Untitled"
    assignee_id = None
    due = None
    status = "Unknown"
    priority = "None"
    
    for field in fields:
        key = field.get("key", "")
        
        if key in ["name", "title"] and field.get("text"):
            title = field["text"]
        
        if key == "todo_assignee" and field.get("user"):
            users = field["user"]
            if isinstance(users, list) and users:
                assignee_id = users[0]
        
        if key == "todo_due_date" and field.get("value"):
            due = field["value"]
        
        # Sales-specific field mappings
        if key == "Col08U80NLD5A" and field.get("value"):
            status = STATUS_OPTIONS.get(field["value"], status)
        
        if key == "Col08U7ZBHRHP" and field.get("value"):
            priority = PRIORITY_OPTIONS.get(field["value"], priority)
    
    # Build permalink
    team_id = "T06K7221F6C"
    permalink = f"https://ikhorlabs.slack.com/lists/{team_id}/{SALES_LIST_ID}?record_id={raw_item['id']}"
    
    return {
        "id": raw_item.get("id"),
        "title": title,
        "assignee_id": assignee_id,
        "assignee_name": USER_NAMES.get(assignee_id, assignee_id),
        "due": due,
        "status": status,
        "priority": priority,
        "permalink": permalink
    }

def categorize_items(items):
    """Categorize items by urgency"""
    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    
    overdue = []
    due_soon = []
    
    for item in items:
        if item["status"] not in ["ToDo", "Meeting", "Workshop"]:
            continue
            
        if item["due"]:
            try:
                due_date = datetime.strptime(item["due"], "%Y-%m-%d").date()
                if due_date < today:
                    overdue.append(item)
                elif due_date <= tomorrow:
                    due_soon.append(item)
            except:
                pass
    
    # Sort by priority
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "None": 99}
    overdue.sort(key=lambda x: priority_order.get(x["priority"], 99))
    due_soon.sort(key=lambda x: priority_order.get(x["priority"], 99))
    
    return overdue, due_soon

def format_message(overdue, due_soon):
    """Format the daily update message"""
    lines = []
    lines.append("📞💓♠️ Sales Chan - Daily Update ♠️💓📞")
    lines.append("")
    
    if overdue:
        lines.append("💢 OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION 💢")
        for item in overdue[:20]:  # Limit to 20 items
            name = item["assignee_name"] or "Unassigned"
            lines.append(f"• ❤️ {name} [{item['title']}]({item['permalink']}) | {item['priority']}")
        lines.append("")
    
    if due_soon:
        lines.append("⏰ Items Due Soon (Next 2 Days)")
        for item in due_soon[:20]:  # Limit to 20 items
            name = item["assignee_name"] or "Unassigned"
            lines.append(f"• 🧡 {name} [{item['title']}]({item['permalink']}) | {item['priority']}")
        lines.append("")
    
    if not overdue and not due_soon:
        lines.append("✨ No urgent items today! Great job team! ✨")
    
    return "\n".join(lines)

def main():
    """Main function"""
    print("=== SALES CHAN DAILY UPDATE TEST ===\n")
    
    # Fetch and parse items
    print("Fetching items from Slack List...")
    raw_items = fetch_list_items()
    
    if not raw_items:
        print("No items found!")
        return
    
    print(f"Found {len(raw_items)} total items\n")
    
    # Parse items
    parsed_items = [parse_list_item(item) for item in raw_items]
    
    # Show status distribution
    status_counts = {}
    for item in parsed_items:
        status = item["status"]
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("Status distribution:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count}")
    print()
    
    # Categorize items
    overdue, due_soon = categorize_items(parsed_items)
    
    print(f"Overdue items: {len(overdue)}")
    print(f"Due soon (next 2 days): {len(due_soon)}")
    print()
    
    # Format and display message
    message = format_message(overdue, due_soon)
    print("=== MESSAGE PREVIEW ===")
    print(message)
    print("=== END PREVIEW ===")
    
    # Option to post to test channel
    if SALES_CHANNEL_ID:
        post = input("\nPost to Slack channel? (y/n): ").strip().lower()
        if post == 'y':
            try:
                response = slack.chat_postMessage(
                    channel=SALES_CHANNEL_ID,
                    text=message
                )
                print("✅ Posted to Slack!")
            except Exception as e:
                print(f"❌ Error posting to Slack: {e}")

if __name__ == "__main__":
    main()