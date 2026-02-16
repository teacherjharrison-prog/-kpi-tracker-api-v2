# KPI Tracker

A full-stack KPI tracking application with a FastAPI backend and React dashboard.

## Features

- **Daily & Biweekly KPI Tracking**: Calls, Reservations, Profit, Spins, Misc Income
- **Auto-Timer**: Tracks time between reservations with pause/resume
- **Peso Conversion**: Real-time USD to MXN conversion with customizable rate
- **Spin Progress**: Tracks prepaid bookings toward next spin (4 prepaid = 1 spin)
- **Editable Goals**: Customize all targets via Settings page
- **Period History**: View archived biweekly periods
- **Group Plan**: All features unlocked

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB (local or Atlas)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/kpi-tracker.git
cd kpi-tracker
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=kpi_tracker
ENV=development
```

Run backend:
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend
yarn install
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

Run frontend:
```bash
yarn start
```

---

## 🚀 Deploy to Render

### Step 1: Create MongoDB Atlas Database (Free)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. Create a free account and a **free M0 cluster**
3. **Database Access**: Create a database user with password
4. **Network Access**: Add `0.0.0.0/0` to allow connections from Render
5. **Get Connection String**: Click "Connect" → "Connect your application"
   
Your string looks like:
```
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/kpi_tracker?retryWrites=true&w=majority
```

### Step 2: Deploy Backend to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `kpi-tracker-api` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |

5. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `MONGO_URL` | Your MongoDB Atlas connection string |
| `DB_NAME` | `kpi_tracker` |
| `ENV` | `production` |

6. Click **"Create Web Service"**
7. Wait for deploy, then copy your backend URL (e.g., `https://kpi-tracker-api.onrender.com`)

### Step 3: Deploy Frontend to Render

1. Click **"New +"** → **"Static Site"**
2. Connect the same GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `kpi-tracker-dashboard` |
| **Root Directory** | `frontend` |
| **Build Command** | `yarn install && yarn build` |
| **Publish Directory** | `build` |

4. Add **Environment Variable**:

| Key | Value |
|-----|-------|
| `REACT_APP_BACKEND_URL` | Your backend URL from Step 2 (e.g., `https://kpi-tracker-api.onrender.com`) |

5. Click **"Create Static Site"**

### Step 4: Test Your Deployment

1. Visit your frontend URL (e.g., `https://kpi-tracker-dashboard.onrender.com`)
2. Check the Dashboard loads with data
3. Test adding a booking in "Add Data"

---

## Troubleshooting

### "MONGO_URL environment variable is required"
→ You forgot to add `MONGO_URL` in Render's Environment Variables

### "Module 'server' not found"
→ Make sure **Root Directory** is set to `backend`

### Frontend shows "Failed to fetch"
→ Check `REACT_APP_BACKEND_URL` is correct (include `https://`, no trailing slash)

### MongoDB connection fails
→ Make sure you added `0.0.0.0/0` to Network Access in MongoDB Atlas

---

## Project Structure

```
kpi-tracker/
├── backend/
│   ├── server.py          # FastAPI application
│   ├── constants.py       # Business rules & goals
│   ├── requirements.txt   # Python dependencies
│   ├── .env              # Local environment (don't commit!)
│   ├── Procfile          # Render process file
│   └── runtime.txt       # Python version
├── frontend/
│   ├── src/
│   │   ├── App.js        # Main React app
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── DataEntry.js
│   │   │   ├── History.js
│   │   │   └── Settings.js
│   │   └── index.js
│   ├── public/
│   ├── package.json
│   └── .env              # Local environment (don't commit!)
├── render.yaml           # Render Blueprint (optional)
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/goals` | Get KPI goals |
| GET | `/api/entries/today` | Today's entry |
| GET | `/api/stats/biweekly` | Biweekly stats |
| GET | `/api/periods/current` | Current period info |
| GET | `/api/periods` | All archived periods |
| PUT | `/api/entries/{date}/calls?calls_received=X` | Update calls |
| POST | `/api/entries/{date}/bookings` | Add booking |
| POST | `/api/entries/{date}/spins` | Add spin |
| POST | `/api/entries/{date}/misc` | Add misc income |

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB connection string |
| `DB_NAME` | No | Database name (default: `kpi_tracker`) |
| `ENV` | No | Environment mode |

### Frontend (`frontend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_BACKEND_URL` | Yes | Backend API URL |

---

## License

MIT
