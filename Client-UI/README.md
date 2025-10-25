# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/d91e7b2d-abcb-4f05-a467-f1bd9955fc21

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/d91e7b2d-abcb-4f05-a467-f1bd9955fc21) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/d91e7b2d-abcb-4f05-a467-f1bd9955fc21) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes it is!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## WebSocket Endpoint Configuration

The WebSocket connection for device communication uses the following environment variable:

```
VITE_SOCKET_URL=wss://socket.bulumerak.com/
```

- By default, it connects to `wss://socket.bulumerak.com/`.
- To override (for development, staging, etc.), set `VITE_SOCKET_URL` in your `.env` file in the `Client-UI` directory.
- Example for local development:
  ```
  VITE_SOCKET_URL=ws://localhost:3000
  ```

## API Endpoint Configuration

The API connection for backend communication uses the following environment variable:

```
VITE_API_URL=https://socket.bulumerak.com/api
```

- By default, it connects to `https://socket.bulumerak.com/api`.
- To override (for development, staging, etc.), set `VITE_API_URL` in your `.env` file in the `Client-UI` directory.
- Example for local development:
  ```
  VITE_API_URL=http://localhost:3000/api
  ```
