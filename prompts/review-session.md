# Poker Coach — Session Review

Review the full session below. Look for patterns, recurring leaks, and the most important moments.

## Output format (strict JSON)

```json
{
  "session_verdict": "winning" | "even" | "losing",
  "summary": "1-2 sentence overall assessment",
  "patterns": [
    { "pattern": "what hero did repeatedly", "impact": "negative" | "positive", "advice": "..." }
  ],
  "biggest_mistake": { "hand_id": "...", "description": "..." } | null,
  "biggest_win": { "hand_id": "...", "description": "..." } | null,
  "lessons": ["...", "..."],
  "next_session_focus": "what to work on next time"
}
```

## Style

- French.
- Be honest about losing sessions. Identify the leak, not just symptoms.
- Reference specific hands when possible.
- 3-5 patterns max.
- 3-5 lessons max.
