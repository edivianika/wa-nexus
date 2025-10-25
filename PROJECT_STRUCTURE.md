# WhatsApp Application Project Structure

This project consists of three main applications that work together to provide a complete WhatsApp integration solution.

## 1. Server (WhatsApp API Backend)
Location: `/Server`

### Purpose
- WhatsApp API implementation using Baileys
- Core backend server handling WhatsApp integration
- Manages connections, sessions, and message routing
- Handles AI agent configurations and webhook management

### Technical Stack
- Node.js with Express
- Baileys for WhatsApp integration
- Redis for caching and queue management
- Socket.IO for real-time communication
- Bull/BullMQ for job queues
- Supabase for database

### Key Components
- `server2.js`: Main server application
- `DATABASE_STRUCTURE.md`: Database schema documentation
- `BROADCAST_MODULE.md`: Broadcast feature documentation
- `src/`: Source code directory
- `session/`: Session management
- `docs/`: Documentation files

### Important Features
- WhatsApp connection management using Baileys
- AI agent integration
- Webhook handling
- Broadcast messaging with BullMQ
- Session management
- Redis caching
- Real-time updates via Socket.IO

## 2. Client-UI (React Frontend)
Location: `/Client-UI`

### Purpose
- Modern React-based user interface
- Dashboard for monitoring and controlling the system
- File management interface
- Real-time connection management

### Technical Stack
- React 18 with TypeScript
- Vite as build tool
- Tailwind CSS for styling
- Shadcn UI components
- React Query for data fetching
- Socket.IO client for real-time updates
- Supabase client for database operations

### Key Features
- Modern UI with Shadcn components
- Real-time connection monitoring
- File upload and management
- User authentication
- Dashboard analytics with Recharts
- Form handling with React Hook Form
- Data validation with Zod

### UI Components
- Rich set of Radix UI primitives
- Custom components using Shadcn
- Responsive design
- Dark mode support
- Toast notifications
- Modal dialogs
- Data tables
- Charts and graphs

## 3. File-Api (File Management Service)
Location: `/File-Api`

### Purpose
- Dedicated file handling service
- File upload and storage management
- Integration with Supabase storage

### Technical Stack
- Express.js server
- Multer for file uploads
- Supabase for file storage
- CORS enabled for cross-origin requests

### Key Features
- File upload handling
- File storage management
- Supabase integration
- File retrieval services
- CORS support for cross-origin requests

## Integration Points

1. **Server ↔ Client-UI**
   - WebSocket connections via Socket.IO
   - REST API endpoints for data exchange
   - Real-time updates for connection status
   - Session management

2. **Server ↔ File-Api**
   - File upload requests
   - File retrieval requests
   - File metadata management
   - Supabase storage integration

3. **Client-UI ↔ File-Api**
   - Direct file uploads
   - File preview and management
   - File metadata display
   - CORS-enabled communication

## Development Guidelines

1. **Database Changes**
   - Always refer to `DATABASE_STRUCTURE.md` for schema changes
   - Update documentation when modifying database structure
   - Test changes with existing data
   - Use Supabase client consistently across applications

2. **Broadcast Features**
   - Follow `BROADCAST_MODULE.md` for implementation
   - Use BullMQ for queue management
   - Test with various message types
   - Monitor queue performance

3. **Cache Management**
   - Keep Redis cache synchronized with database
   - Update configCache on connection refresh
   - Document cache invalidation strategies
   - Monitor Redis memory usage

4. **Testing Requirements**
   - Test all database queries
   - Verify cache consistency
   - Test webhook endpoints
   - Validate file operations
   - Test real-time features
   - Verify UI components

5. **Code Maintenance**
   - Add comments for complex logic
   - Document API changes
   - Update relevant .md files
   - Follow existing code patterns
   - Maintain TypeScript types
   - Keep dependencies updated

## Security Considerations

1. **API Security**
   - Validate all incoming requests
   - Implement proper authentication
   - Secure file uploads
   - Use environment variables for sensitive data
   - Implement rate limiting

2. **Data Protection**
   - Encrypt sensitive data
   - Implement proper access controls
   - Regular security audits
   - Secure file storage
   - Validate file types and sizes

3. **Session Management**
   - Secure session handling
   - Implement proper timeout mechanisms
   - Monitor for suspicious activities
   - Use secure cookies
   - Implement CSRF protection

## Development Workflow

### Running All Applications Together

1. **Initial Setup**
   ```bash
   # Install dependencies for all applications
   npm run install:all
   ```

2. **Development Mode**
   ```bash
   # Run all applications in development mode
   npm run dev
   ```
   This will start:
   - Server (WhatsApp API) on default port
   - Client-UI (React Frontend) on port 5173
   - File-Api on default port

3. **Individual Application Development**
   ```bash
   # Run Server only
   npm run start:server

   # Run Client-UI only
   npm run start:client

   # Run File-Api only
   npm run start:file-api
   ```

4. **Production Build**
   ```bash
   # Build Client-UI for production
   npm run build
   ```

### Port Configuration
- Server (WhatsApp API): Default port (check .env)
- Client-UI: Port 5173 (Vite default)
- File-Api: Default port (check .env)

Make sure to configure the correct ports in your .env files and update the client configuration accordingly.

1. **Server Development**
   ```bash
   npm run dev        # Run all services
   npm run dev:main   # Run main server
   npm run dev:broadcast  # Run broadcast server
   npm run dev:worker    # Run broadcast worker
   ```

2. **Client-UI Development**
   ```bash
   npm run dev        # Start development server
   npm run build     # Build for production
   npm run preview   # Preview production build
   ```

3. **File-Api Development**
   ```bash
   npm run dev       # Start development server
   npm run dev:debug # Start with debugging
   npm run watch     # Watch mode with nodemon
   ``` 