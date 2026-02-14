# KPI Tracker

A FastAPI backend for tracking KPIs with calendar-based biweekly periods.

## Project Structure

```
├── backend/
│   ├── server.py          # Main FastAPI application
│   ├── constants.py       # Business constants & goals
│   ├── requirements.txt   # Python dependencies
│   ├── .env               # Environment variables (local only)
│   ├── Procfile           # Render process file
│   └── runtime.txt        # Python version for Render
├── frontend/              # React Native (Expo) app
├── render.yaml            # Render Blueprint configuration
└── README.md
```

## Local Development

### Prerequisites
- Python 3.11+
- MongoDB running locally

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/jakejoe79/kpi-tracker.git
cd kpi-tracker
```

2. **Create backend environment**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **Configure environment variables**
Create `.env` file in the `backend` folder:
```env
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=kpi_tracker
ENV=development
```

4. **Run the server**
```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

5. **Test the API**
```bash
curl http://localhost:8000/api/health
```

---

## Deploying to Render

### Option 1: Blueprint Deployment (Recommended)

1. **Create a MongoDB database** (use [MongoDB Atlas](https://www.mongodb.com/atlas) free tier)
   - Create a cluster
   - Get your connection string: `mongodb+srv://username:password@cluster.mongodb.net/kpi_tracker`

2. **Connect your GitHub repo to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect `render.yaml` automatically

3. **Set environment variables**
   - After deployment, go to your service's "Environment" tab
   - Add `MONGO_URL` with your MongoDB Atlas connection string

### Option 2: Manual Deployment

1. **Create a new Web Service on Render**
   - Runtime: Python 3
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`

2. **Set environment variables**
   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | Your MongoDB connection string |
   | `DB_NAME` | `kpi_tracker` |
   | `ENV` | `production` |

3. **Health Check**
   - Set health check path to `/api/health`

---

## Common Issues & Fixes

### 1. "Module 'server' not found"
**Cause**: Running uvicorn from wrong directory  
**Fix**: Ensure `Root Directory` is set to `backend` in Render, or run from the `backend` folder locally.

### 2. "MONGO_URL environment variable is required"
**Cause**: Missing environment variable  
**Fix**: 
- **Local**: Create `.env` file in `backend/` folder
- **Render**: Add `MONGO_URL` in the Environment tab

### 3. "Address already in use"
**Cause**: Another process using the port  
**Fix**: 
```bash
# Find and kill process on port 8000
lsof -i :8000
kill -9 <PID>
```

### 4. Server not loading .env file
**Fix**: Ensure `python-dotenv` is in requirements.txt and `.env` is in the same directory as `server.py`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/` | API info |
| GET | `/api/health` | Health check |
| GET | `/api/goals` | Get KPI goals |
| GET | `/api/entries/today` | Get today's entry |
| GET | `/api/stats/biweekly` | Get biweekly stats |
| GET | `/api/periods/current` | Get current period info |
| POST | `/api/admin/migrate-legacy` | Run data migration |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URL` | Yes | - | MongoDB connection string |
| `DB_NAME` | No | `kpi_tracker` | Database name |
| `ENV` | No | `development` | Environment mode |

---

## MongoDB Atlas Setup (Free Tier)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. Create a free account
3. Create a new cluster (M0 Sandbox is free)
4. Set up database access (create a user)
5. Set up network access (add `0.0.0.0/0` to allow all IPs for Render)
6. Get your connection string from "Connect" → "Connect your application"
7. Replace `<password>` with your database user password

Your connection string will look like:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/kpi_tracker?retryWrites=true&w=majority
```
