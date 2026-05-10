# JSON Schemas Documentation

This document contains all JSON schemas used throughout the chat application for Graffiti data discovery and validation.

---

## 1. User Membership Activity Schema

**Purpose:** Track user's chat memberships (join/leave actions)  
**Location:** `stores/chat.js` - chatList computed property  
**Graffiti Channel:** `user:{actor}:Membership`

```json
{
  "properties": {
    "value": {
      "required": ["action", "value", "chatId", "published"],
      "properties": {
        "action": {
          "type": "string",
          "description": "Type of action (always 'Membership')"
        },
        "value": {
          "type": "string",
          "enum": ["Join", "Leave"],
          "description": "Membership state - Join or Leave"
        },
        "chatId": {
          "type": "string",
          "description": "UUID of the chat room"
        },
        "chatName": {
          "type": "string",
          "description": "Human-readable name of the chat"
        },
        "published": {
          "type": "number",
          "description": "Timestamp when action was published (milliseconds)"
        }
      }
    }
  }
}
```

**Example Data:**
```json
{
  "value": {
    "action": "Membership",
    "value": "Join",
    "chatId": "550e8400-e29b-41d4-a716-446655440000",
    "chatName": "General Discussion",
    "published": 1714982400000
  }
}
```

---

## 2. Chat Activity Schema

**Purpose:** Track chat creation and lifecycle events  
**Location:** `stores/chat.js` - joinChat function  
**Graffiti Channel:** `chat:{chatId}:Activities`

```json
{
  "properties": {
    "value": {
      "required": ["action", "chatId", "chatName", "published", "parentChatId", "rootChatId"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["Create", "Delete"],
          "description": "Chat lifecycle action"
        },
        "chatId": {
          "type": "string",
          "description": "UUID of this chat"
        },
        "chatName": {
          "type": "string",
          "description": "Display name of the chat"
        },
        "published": {
          "type": "number",
          "description": "Timestamp when created (milliseconds)"
        },
        "parentChatId": {
          "type": "string",
          "description": "ID of parent chat (for nested chats)"
        },
        "rootChatId": {
          "type": "string",
          "description": "ID of root chat (for threading)"
        }
      }
    }
  }
}
```

**Example Data:**
```json
{
  "value": {
    "action": "Create",
    "chatId": "550e8400-e29b-41d4-a716-446655440000",
    "chatName": "General Discussion",
    "published": 1714982400000,
    "parentChatId": "550e8400-e29b-41d4-a716-446655440000",
    "rootChatId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 3. Chat Membership Schema

**Purpose:** Track who is a member of a specific chat  
**Location:** `stores/chat.js` - createNewChat, joinChat, leaveChat  
**Graffiti Channel:** `chat:{chatId}:Membership`

```json
{
  "properties": {
    "value": {
      "required": ["action", "value", "user", "published"],
      "properties": {
        "action": {
          "type": "string",
          "description": "Action type (always 'Membership')"
        },
        "value": {
          "type": "string",
          "enum": ["Join", "Leave"],
          "description": "Membership state"
        },
        "user": {
          "type": "string",
          "description": "Actor/user identifier"
        },
        "published": {
          "type": "number",
          "description": "Timestamp of action (milliseconds)"
        }
      }
    }
  }
}
```

**Example Data:**
```json
{
  "value": {
    "action": "Membership",
    "value": "Join",
    "user": "user:alice@example.com",
    "published": 1714982400000
  }
}
```

---

## 4. Chat Descendants Schema

**Purpose:** Track descendant/threaded chats  
**Location:** `stores/chat.js` - createNewChat  
**Graffiti Channel:** `chat:{rootChatId}:Descendants`

```json
{
  "properties": {
    "value": {
      "required": ["action", "chatId", "name", "published", "parentChatId", "rootChatId"],
      "properties": {
        "action": {
          "type": "string",
          "description": "Action type (always 'Create')"
        },
        "chatId": {
          "type": "string",
          "description": "UUID of the descendant chat"
        },
        "name": {
          "type": "string",
          "description": "Display name of chat"
        },
        "published": {
          "type": "number",
          "description": "Creation timestamp (milliseconds)"
        },
        "parentChatId": {
          "type": "string",
          "description": "ID of immediate parent"
        },
        "rootChatId": {
          "type": "string",
          "description": "ID of root chat in hierarchy"
        }
      }
    }
  }
}
```

**Example Data:**
```json
{
  "value": {
    "action": "Create",
    "chatId": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Discussion Thread",
    "published": 1714982450000,
    "parentChatId": "550e8400-e29b-41d4-a716-446655440000",
    "rootChatId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 5. Chat Messages Schema

**Purpose:** Store messages sent in a chat  
**Location:** `Components/chatFlow.js` - chatMessages  
**Graffiti Channel:** `chat:{chatId}:Messages`

```json
{
  "properties": {
    "value": {
      "required": ["action", "content", "published", "user"],
      "properties": {
        "action": {
          "type": "string",
          "const": "Message",
          "description": "Action type (always 'Message')"
        },
        "content": {
          "type": "string",
          "description": "The message text content"
        },
        "media": {
          "type": "array",
          "description": "Optional image, video, or PDF attachments",
          "items": {
            "type": "object",
            "required": ["url", "type", "mimeType", "name", "size"],
            "properties": {
              "url": {
                "type": "string",
                "description": "Graffiti media URL"
              },
              "type": {
                "type": "string",
                "enum": ["image", "video", "pdf"],
                "description": "Attachment display kind"
              },
              "mimeType": {
                "type": "string",
                "description": "Uploaded file MIME type"
              },
              "name": {
                "type": "string",
                "description": "Original file name"
              },
              "size": {
                "type": "number",
                "description": "Uploaded file size in bytes"
              }
            }
          }
        },
        "published": {
          "type": "number",
          "description": "Timestamp when message was sent (milliseconds)"
        },
        "user": {
          "type": "string",
          "description": "Actor identifier of sender"
        }
      }
    }
  }
}
```

**Example Data:**
```json
{
  "value": {
    "action": "Message",
    "content": "Here is the assignment brief.",
    "media": [
      {
        "url": "graffiti://media/550e8400-e29b-41d4-a716-446655440000",
        "type": "pdf",
        "mimeType": "application/pdf",
        "name": "assignment-brief.pdf",
        "size": 204800
      }
    ],
    "published": 1714982500000,
    "user": "user:alice@example.com"
  }
}
```

---

## 5a. Chat Message Interactions Schema

**Purpose:** Store message likes, pins, edits, and recalls  
**Location:** `Components/chatFlow.js` - messageInteractions  
**Graffiti Channel:** `chat:{chatId}:MessageInteractions`

```json
{
  "properties": {
    "value": {
      "required": ["action", "messageId", "published", "user"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["MessageLike", "MessagePin", "MessageEdit", "MessageRecall"]
        },
        "messageId": {
          "type": "string",
          "description": "Message object URL or client ID"
        },
        "value": {
          "type": "string",
          "description": "Like/Unlike, Pin/Unpin, edited message content, or Recall"
        },
        "published": {
          "type": "number",
          "description": "Timestamp when interaction was sent (milliseconds)"
        },
        "user": {
          "type": "string",
          "description": "Actor identifier of interaction author"
        }
      }
    }
  }
}
```

Only interactions authored by the original message sender are applied for `MessageEdit` and `MessageRecall`.

---

## 6. User Activities Schema

**Purpose:** Track user profile and activity information  
**Location:** `stores/user.js` - activities  
**Graffiti Channel:** `user:{actor}:Activities`

```json
{
  "properties": {
    "value": {
      "required": ["action", "published", "user"],
      "properties": {
        "action": {
          "type": "string",
          "enum": ["ProfileName", "ProfileImage", "ProfileBio"],
          "description": "Type of user activity"
        },
        "published": {
          "type": "number",
          "description": "Timestamp of activity (milliseconds)"
        },
        "user": {
          "type": "string",
          "description": "Actor identifier"
        },
        "name": {
          "type": "string",
          "description": "User's display name (for ProfileName action)"
        },
        "content": {
          "type": "string",
          "description": "User's bio/description (for ProfileBio action)"
        },
        "url": {
          "type": "string",
          "description": "Media URL for profile image (for ProfileImage action)"
        }
      }
    }
  }
}
```

**Example Data (ProfileName):**
```json
{
  "value": {
    "action": "ProfileName",
    "user": "user:alice@example.com",
    "name": "Alice Smith",
    "published": 1714982400000
  }
}
```

**Example Data (ProfileImage):**
```json
{
  "value": {
    "action": "ProfileImage",
    "user": "user:alice@example.com",
    "url": "graffiti://media/550e8400-e29b-41d4-a716-446655440000",
    "published": 1714982410000
  }
}
```

**Example Data (ProfileBio):**
```json
{
  "value": {
    "action": "ProfileBio",
    "user": "user:alice@example.com",
    "content": "Hi, I'm Alice! Nice to meet you.",
    "published": 1714982420000
  }
}
```

---

## 7. User Profiles Discovery Schema

**Purpose:** Discover profile information for multiple users  
**Location:** `Components/chatFlow.js` - profileObjects  
**Graffiti Channel:** `user:{userId}:Activities` (dynamic, one per user)

```json
{
  "properties": {
    "value": {
      "required": ["action", "published", "user"],
      "properties": {
        "action": {
          "type": "string",
          "description": "Activity type"
        },
        "published": {
          "type": "number",
          "description": "Timestamp (milliseconds)"
        },
        "user": {
          "type": "string",
          "description": "User actor identifier"
        },
        "name": {
          "type": "string",
          "description": "Profile name (optional)"
        },
        "content": {
          "type": "string",
          "description": "Profile content/bio (optional)"
        },
        "url": {
          "type": "string",
          "description": "Media URL (optional)"
        }
      }
    }
  }
}
```

---

## Schema Validation Pattern

All schemas follow the JSON Schema standard and are used with Graffiti's discovery API:

```javascript
useGraffitiDiscover(
  channels,           // Array of channel names to subscribe to
  schemaDefinition,   // Schema object with properties and required fields
  session,            // User session object
  true                // Include metadata flag
);
```

### Key Schema Concepts

1. **Required Fields:** Must be present in discovered objects
2. **Properties:** Field definitions with types and constraints
3. **Enum:** Limited set of allowed values (e.g., "Join" or "Leave")
4. **Const:** Fixed value constraint (used for action types)
5. **Type:** JSON type (string, number, boolean, etc.)

---

## Channel Naming Convention

Channels follow the pattern: `{scope}:{identifier}:{collection}`

- `user:{actor}:Membership` - User's chat memberships
- `user:{actor}:Activities` - User's profile activities
- `chat:{chatId}:Activities` - Chat creation/deletion activities
- `chat:{chatId}:Membership` - Chat member list
- `chat:{chatId}:Messages` - Chat messages
- `chat:{rootChatId}:Descendants` - Nested/threaded chats

---

## Data Flow Example

### Creating a New Chat

1. **User posts to `user:{actor}:Membership`**
   - Schema: User Membership Activity
   - Action: Join
   - Updates user's visible chat list

2. **System posts to `chat:{chatId}:Activities`**
   - Schema: Chat Activity
   - Action: Create
   - Records chat creation timestamp

3. **System posts to `chat:{chatId}:Membership`**
   - Schema: Chat Membership
   - Action: Join
   - Adds user as member

4. **System posts to `chat:{rootChatId}:Descendants`**
   - Schema: Chat Descendants
   - Action: Create
   - Records chat hierarchy

---

## Notes

- All timestamps are in milliseconds (Unix epoch × 1000)
- User identifiers typically follow format: `user:{email}` or `user:{id}`
- UUIDs (v4) are used for chat IDs
- Media URLs are Graffiti-specific URLs starting with `graffiti://`
- Schemas are flexible - optional fields beyond required ones can be added
