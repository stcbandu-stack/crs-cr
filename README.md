# CRS Printing System - SolidJS

ระบบสั่งงานร้านป้าย - Migrated from Vue 3 to SolidJS

## Tech Stack

- **Frontend**: SolidJS + TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **Build Tool**: Vite
- **Deployment**: Vercel

## Project Structure

```
/src
  /components        # UI Components (Button, Modal, Card, etc.)
  /composables       # Business Logic (useInventory, useOrder)
  /lib               # Utilities (Supabase client, types, utils)
  /routes            # Page Components (Dashboard, Order, History, etc.)
  /store             # Global State (Auth, UI)
  App.tsx            # Main App with Router
  index.tsx          # Entry Point
  index.css          # Global Styles
```

## Features

- 🔐 **Authentication** - Login with Supabase Auth + Device Management (max 2 devices)
- 📝 **Order Management** - Create, view, and print job orders
- 📦 **Inventory Management** - Track materials, stock in/out
- 👥 **Customer Database** - Corporate customer management
- 💰 **Service Pricing** - Manage service prices
- 🖨️ **Print-Ready** - A4 document generation for printing

## Getting Started

### 1. Install Dependencies

```bash
cd solid-app
npm install
```

### 2. Configure Environment

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Update with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Production

```bash
npm run build
```

## Deployment to Vercel

1. Push code to GitHub
2. Import project to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## Database Schema (Supabase)

Required tables:
- `profiles` - User profiles (id, email, role, display_name)
- `user_sessions` - Device session management
- `provider_info` - Organization info
- `customers` - Customer database
- `services` - Service pricing
- `job_orders` - Job orders
- `materials` - Inventory materials
- `material_logs` - Stock movement logs

## Migration Notes

Migrated from Vue 3 single-file setup to:
- SolidJS with fine-grained reactivity
- TypeScript for type safety
- Modular structure with composables
- @solidjs/router for routing

## License

MIT
