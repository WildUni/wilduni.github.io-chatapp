# Function Specifications Documentation

Complete specification of all functions throughout the chat application.

---

## Table of Contents

1. [Store Functions (Pinia)](#store-functions)
   - [Chat Store](#chat-store)
   - [User Store](#user-store)
2. [Component Functions](#component-functions)
   - [Page Components](#page-components)
   - [Feature Components](#feature-components)
3. [Utility Functions](#utility-functions)

---

## Store Functions

### Chat Store (`stores/chat.js`)

#### `createNewChat(parent = null, root = null)`

**Purpose:** Create a new chat room and post necessary membership/activity records

**Parameters:**
- `parent` (string|null): Parent chat ID for nested chats (optional)
- `root` (string|null): Root chat ID for threading (optional)

**Returns:** `Promise<boolean>` - Success status of creation

**Side Effects:**
- Sets `isCreating`, `createError`, `createSuccess` flags
- Posts to multiple Graffiti channels:
  - `user:{actor}:Membership` (if root-level)
  - `chat:{chatId}:Activities` (if root-level)
  - `chat:{chatId}:Membership` (if root-level)
  - `chat:{rootChatId}:Descendants` (always)
- Clears `newChatName` on success

**Schema Used:** User Membership Activity, Chat Activity, Chat Membership, Chat Descendants

**Example:**
```javascript
// Create root-level chat
const success = await chatStore.createNewChat();

// Create nested chat
const success = await chatStore.createNewChat('parent-id', 'root-id');
```

---

#### `joinChat()`

**Purpose:** Join an existing chat by validating it exists then adding user to membership

**Parameters:** None (uses `joinChatId` from state)

**Returns:** `Promise<boolean>` - Success status of join operation

**Side Effects:**
- Sets `isJoining`, `joinError`, `joinSuccess` flags
- Posts to Graffiti channels:
  - `chat:{joinChatId}:Membership`
  - `user:{actor}:Membership`
- Clears `joinChatId` on success

**Schema Used:** Chat Activity (for validation), Chat Membership, User Membership Activity

**Example:**
```javascript
const success = await chatStore.joinChat();
if (success) {
  console.log('Joined chat!');
}
```

---

#### `leaveChat(chatId)`

**Purpose:** Remove user from chat membership and update activity records

**Parameters:**
- `chatId` (string): ID of chat to leave

**Returns:** `Promise<boolean>` - Success status of leave operation

**Side Effects:**
- Sets `isLeaving`, `leaveError`, `leaveSuccess` flags
- Posts Leave action to:
  - `chat:{chatId}:Membership`
  - `user:{actor}:Membership`
- Clears active chat state if leaving current chat

**Schema Used:** Chat Membership, User Membership Activity

**Example:**
```javascript
const success = await chatStore.leaveChat('chat-id-123');
if (success) {
  // Navigate away from chat
}
```

---

#### `waitForActivities(activities, timeout = 2000)` (Helper)

**Purpose:** Wait for Graffiti activities to load with timeout prevention

**Parameters:**
- `activities` (Array): Reactive Graffiti activities array
- `timeout` (number): Milliseconds to wait before resolving empty (default: 2000)

**Returns:** `Promise<Array>` - Array of activities or empty array on timeout

**Implementation:** Uses Vue watch + setTimeout

**Example:**
```javascript
const acts = await waitForActivities(activities, 3000);
```

---

#### `findLatestCreateAction(activities)` (Helper)

**Purpose:** Find most recent chat creation from activities array

**Parameters:**
- `activities` (Array): Array of activity objects

**Returns:** `Object|null` - Latest Create activity or null if not found/deleted

**Example:**
```javascript
const chatCreation = findLatestCreateAction(acts);
if (chatCreation) {
  console.log('Chat exists');
}
```

---

### User Store (`stores/user.js`)

#### `updateProfileName(name)`

**Purpose:** Update user's display name in profile

**Parameters:**
- `name` (string): New profile name

**Returns:** `Promise<void>`

**Side Effects:**
- Posts ProfileName action to `user:{actor}:Activities`
- Trims whitespace; returns early if empty

**Schema Used:** User Activities (ProfileName action)

**Example:**
```javascript
await userStore.updateProfileName('Alice Smith');
```

---

#### `updateProfileImage(file)`

**Purpose:** Upload profile image and update user profile

**Parameters:**
- `file` (File): Image file from file input

**Returns:** `Promise<void>`

**Side Effects:**
- Calls `graffiti.postMedia()` to upload image
- Posts ProfileImage action to `user:{actor}:Activities`
- Deletes old image from Graffiti (if exists)
- Updates internal profile image state

**Schema Used:** User Activities (ProfileImage action)

**Example:**
```javascript
const file = fileInput.files[0];
await userStore.updateProfileImage(file);
```

---

#### `updateProfileBio(content)`

**Purpose:** Update user's biography/description

**Parameters:**
- `content` (string): New bio text

**Returns:** `Promise<void>`

**Side Effects:**
- Posts ProfileBio action to `user:{actor}:Activities`

**Schema Used:** User Activities (ProfileBio action)

**Example:**
```javascript
await userStore.updateProfileBio('Hi, I am a developer!');
```

---

#### `handleFileUpload(event)`

**Purpose:** Handle file input change and upload profile image

**Parameters:**
- `event` (Event): File input change event

**Returns:** `Promise<void>`

**Side Effects:**
- Extracts file from `event.target.files[0]`
- Calls `updateProfileImage(file)`
- Clears input value for future uploads

**Example:**
```html
<input type="file" @change="userStore.handleFileUpload" />
```

---

## Component Functions

### Page Components

#### `Pages/home.js` - `setup()`

**Purpose:** Main page setup with chat management and routing

**Parameters:** None

**Returns:** `Object` - Component context object

**Exported Functions:**

##### `setActiveChat(chatId, chatName, rootId)`

**Purpose:** Set active chat and update route

**Parameters:**
- `chatId` (string): Chat ID to activate
- `chatName` (string): Display name of chat
- `rootId` (string): Root chat ID (optional)

**Side Effects:**
- Updates `activeChatId`, `activeChatName`, `activeChatRootId`
- Pushes new route with chat ID

**Example:**
```javascript
setActiveChat('chat-123', 'General', 'chat-123');
```

---

##### `clearActive()`

**Purpose:** Clear active chat selection

**Parameters:** None

**Side Effects:**
- Calls `setActiveChat(null, null, null)`

---

##### `completeOnboarding()`

**Purpose:** Complete user onboarding by setting profile name

**Parameters:** None (uses `firstName` ref)

**Side Effects:**
- Validates `firstName` is not empty
- Calls `userStore.updateProfileName(firstName)`

---

##### `leaveActiveChat(chatId)`

**Purpose:** Leave active chat and navigate home

**Parameters:**
- `chatId` (string): ID of chat to leave

**Returns:** `Promise<void>`

**Side Effects:**
- Calls `chatStore.leaveChat(chatId)`
- Waits with `delay()`
- Routes to home page

---

#### `Pages/login.js` - `setup()`

**Purpose:** Login page initialization

**Parameters:** None

**Returns:** `Object` - Component state (basic implementation)

---

### Feature Components

#### `Components/chatFlow.js` - `setup()`

**Purpose:** Discover and display chat messages with user profiles

**Parameters:** None

**Returns:** `Object` - Messages and profile data

**Exported Functions:**

##### `chatMessageChannels()`

**Purpose:** Get message channel for active chat

**Parameters:** None

**Returns:** `Array<string>` - Array with channel or empty

**Example:**
```javascript
// Returns: ["chat:abc-123:Messages"]
```

---

##### `resolveAvatar(url)`

**Purpose:** Resolve Graffiti media URL to browser-compatible object URL

**Parameters:**
- `url` (string): Graffiti media URL

**Returns:** `Promise<string|null>` - Object URL or null on error

**Side Effects:**
- Caches resolved URLs in `avatarCache` Map
- Calls `graffiti.getMedia()` to fetch blob

**Performance:** Uses Map cache to avoid duplicate fetches

**Example:**
```javascript
const objectUrl = await resolveAvatar('graffiti://media/xyz');
```

---

#### `Components/chatInput.js` - `setup()`

**Purpose:** Handle message input and sending

**Parameters:** None

**Returns:** `Object` - Input state and send function

**Exported Functions:**

##### `sendMessage()`

**Purpose:** Send message to active chat

**Parameters:** None (uses `myMessage` ref and `activeChatId` from store)

**Returns:** `Promise<void>`

**Side Effects:**
- Sets `isSending`, `sendError` flags
- Posts message to `chat:{activeChatId}:Messages`
- Clears `myMessage` on success

**Validation:**
- Message must not be empty (trims whitespace)
- Chat must be active

**Error Messages:**
- "Message cannot be empty"
- "No active chat selected"
- "Message failed to send. Please try again."

**Schema Used:** Chat Messages

**Example:**
```javascript
await chatInput.sendMessage();
```

---

#### `Components/chatList.js` - `setup()`

**Purpose:** Display list of user's chats

**Parameters:** None

**Returns:** `Object` - Chat list and emit handler

**Exported Functions:**

##### `emitUpdateChat(chatId, chatName, rootId)`

**Purpose:** Emit event when chat is selected

**Parameters:**
- `chatId` (string): Selected chat ID
- `chatName` (string): Chat name
- `rootId` (string): Root chat ID

**Emits:** `update-active-chat` event to parent

---

#### `Components/chatListItem.js` - `setup()`

**Purpose:** Individual chat list item component

**Parameters:**
- `props.chatId` (string)
- `props.chatName` (string)

**Returns:** `Object` - Active chat reference

---

#### `Components/createChat.js` - `setup()`

**Purpose:** Handle create/join chat dialog

**Parameters:** None

**Returns:** `Object` - Form state and handlers

**Exported Functions:**

##### `closeDrawer()`

**Purpose:** Close chat creation drawer dialog

**Parameters:** None

**Side Effects:**
- Finds element with ID "newChatMenu"
- Sets `open = false`

---

##### `handleCreateChat()`

**Purpose:** Handle new chat creation from form

**Parameters:** None

**Returns:** `Promise<void>`

**Side Effects:**
- Calls `chatStore.createNewChat()`
- On success: waits with `delay()` then closes drawer

---

##### `handleJoinChat()`

**Purpose:** Handle join existing chat from form

**Parameters:** None

**Returns:** `Promise<void>`

**Side Effects:**
- Calls `chatStore.joinChat()`
- On success: waits with `delay()` then closes drawer

---

#### `Components/chatTree.js`

**Purpose:** Display hierarchical chat structure

**Parameters:** None

---

#### `Components/profile.js`

**Purpose:** Display and edit user profile

**Parameters:**
- `props.actor` (string): User actor identifier

---

#### `Components/message.js`

**Purpose:** Display individual message with user info

**Parameters:**
- `props.username` (string): Message sender's name
- `props.messageContent` (string): Message text
- `props.avatarUrl` (string): Profile image URL
- `props.published` (number): Message timestamp

---

## Utility Functions

### `index.js`

#### `loadComponent(name)`

**Purpose:** Dynamically load page components with lazy loading

**Parameters:**
- `name` (string): Component name (matches filename)

**Returns:** `Function` - Function that returns promise resolving to component

**Implementation:** Uses dynamic `import()` from `Pages/{name}.js`

**Example:**
```javascript
const component = loadComponent("login"); // Loads Pages/login.js
```

---

#### `delay(ms = 1000)`

**Purpose:** Create delay/pause in execution

**Parameters:**
- `ms` (number): Milliseconds to delay (default: 1000)

**Returns:** `Promise<void>` - Resolves after delay

**Example:**
```javascript
await delay(500); // Wait 500ms
await delay();    // Wait 1000ms (default)
```

---

## Async Function Flow Patterns

### Creating a Chat

```
User Input (newChatName)
    ↓
createNewChat()
    ↓
Generate UUID, timestamps
    ↓
Promise.all([
  Post to user:Membership,
  Post to chat:Activities,
  Post to chat:Membership,
  Post to chat:Descendants
])
    ↓
Set success flag, clear input
```

### Sending a Message

```
User Input (myMessage)
    ↓
sendMessage()
    ↓
Trim & validate
    ↓
graffiti.post() to chat:Messages
    ↓
Clear input on success
```

### Loading Chat Messages

```
activeChatId changes
    ↓
useGraffitiDiscover() subscribes to chat:Messages
    ↓
Objects stream in
    ↓
Extract users → discover user:Activities
    ↓
Build profile map
    ↓
Resolve avatar URLs (cached)
    ↓
Combine messages with profiles
```

---

## Error Handling Pattern

All async operations follow this pattern:

```javascript
try {
  // Set loading flag
  isLoading.value = true;
  errorFlag.value = false;
  
  // Execute operation
  await operation();
  
  // Set success flag
  successFlag.value = true;
  
  // Clear success after timeout
  setTimeout(() => {
    successFlag.value = false;
  }, 1500);
} catch (err) {
  // Set error flag
  errorFlag.value = true;
  console.error("Operation failed:", err);
} finally {
  // Always clear loading flag
  isLoading.value = false;
}
```

---

## Performance Optimizations

### Parallel Operations

Multiple Graffiti posts are executed in parallel:
```javascript
await Promise.all([
  graffiti.post(...),
  graffiti.post(...),
  graffiti.post(...)
]);
```

### Caching

Avatar URLs are cached in Map to prevent duplicate API calls:
```javascript
const avatarCache = ref(new Map());
// Cache hit? Return cached URL
// Cache miss? Fetch and store
```

### Lazy Loading

Components are loaded on-demand:
```javascript
const component = await loadComponent("name");
```

### Computed Properties

Vue computed properties automatically track dependencies and update efficiently.

---

## State Management

All state is managed via Pinia stores:

- **Chat Store:** Chat operations, active chat, membership
- **User Store:** Profile info, avatar, bio

Components access store via:
```javascript
const store = useChatStore();
const { state } = storeToRefs(store);
```

---

## Notes

- All timestamps are in milliseconds
- Functions use async/await for readability
- Errors are caught and stored in reactive flags
- Success messages auto-clear after 1.5 seconds
- Memory management includes proper cleanup of blob URLs and watchers
