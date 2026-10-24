"""
title: Play this room
author: Hack_ECSS team
version: 0.1.0
description: Adds a button under Gemma's reply that opens the JSON level in PHANTOM FUSION.
"""

# How to install (Open WebUI):
#   Admin Panel > Functions > + (Create) > paste this whole file > Save
#   then switch the function ON, and in Workspace > Models > phantom-architect
#   tick it under "Actions".

import base64
import json
import re

from pydantic import BaseModel, Field


class Action:
    class Valves(BaseModel):
        GAME_URL: str = Field(
            default="http://localhost:8081",
            description="Where the game runs, as seen from your browser",
        )

    def __init__(self):
        self.valves = self.Valves()

    async def action(self, body: dict, __user__=None, __event_emitter__=None, __event_call__=None):
        messages = body.get("messages", [])
        reply = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "assistant"), "")
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", reply.strip())
        start, end = text.find("{"), text.rfind("}")
        try:
            level = json.loads(text[start : end + 1])
        except Exception:
            note = "\n\n> Could not find a JSON level in this reply. Ask Gemma to reply with JSON only."
        else:
            code = base64.urlsafe_b64encode(json.dumps(level).encode()).decode()
            url = f"{self.valves.GAME_URL.rstrip('/')}/#level={code}"
            note = f"\n\n**[Play {level.get('room_name', 'this room')} in PHANTOM FUSION]({url})**"
        if __event_emitter__:
            await __event_emitter__({"type": "message", "data": {"content": note}})
