# KPI Tracker

Track your daily KPIs: Calls, Reservations, Profit, Spins, and more.

---

## 🚀 DEPLOY TO RENDER (5 Minutes)

### Step 1: Get MongoDB (Free)
1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas/database) → Create free account
2. Create a FREE cluster (M0)
3. **Database Access** → Add user with password
4. **Network Access** → Add `0.0.0.0/0`
5. **Connect** → Copy connection string:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/kpi_tracker
   ```

### Step 2: Deploy Backend
1. Go to [render.com](https://render.com) → New → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | Your MongoDB string from Step 1 |
   | `DB_NAME` | `kpi_tracker` |
5. Click **Create** → Wait for deploy → Copy your URL (e.g., `https://kpi-tracker-api.onrender.com`)

### Step 3: Deploy Frontend
1. Render → New → **Static Site**
2. Connect same GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn install && yarn build`
   - **Publish Directory**: `build`
4. **Environment Variable**:
   | Key | Value |
   |-----|-------|
   | `REACT_APP_BACKEND_URL` | Your backend URL from Step 2 |
5. Click **Create** → Done!

---

## 🔌 Chrome Extension

The `/extension` folder contains a Chrome extension for quick access.

### Install:
1. Download the `extension` folder from this repo
2. Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → Select the `extension` folder
5. Click the extension icon → Enter your backend URL

### Features:
- View today's stats (Calls, Bookings, Profit, Spins)
- **+Add Call** button to quickly log calls
- Open dashboard button
- **Requires Pro or Group plan**

---

## 📱 Features

- **Timer**: Auto-tracks time between reservations (pause/resume)
- **Peso Conversion**: USD to MXN with customizable rate
- **Spin Tracking**: Only prepaid bookings count (4 prepaid = 1 spin)
- **Editable Goals**: Customize all targets in Settings
- **Period History**: View archived biweekly periods
- **Webhook**: `POST /api/webhook/call` for softphone integration

---

## 🔧 Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Edit with your MongoDB URL
uvicorn server:app --reload --port 8000

# Frontend
cd frontend
yarn install
cp .env.example .env  # Edit with http://localhost:8000
yarn start
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhook/call` | Log a call (Pro/Group only) |
| `GET` | `/api/entries/today` | Today's data |
| `GET` | `/api/stats/biweekly` | Period stats |
| `PUT` | `/api/entries/{date}/calls?calls_received=X` | Update calls |
| `POST` | `/api/entries/{date}/bookings` | Add booking |
| `POST` | `/api/entries/{date}/spins` | Add spin |

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "MONGO_URL required" | Add MONGO_URL in Render Environment Variables |
| "Module not found" | Set Root Directory to `backend` |
| "Failed to fetch" | Check REACT_APP_BACKEND_URL is correct |
| MongoDB won't connect | Add `0.0.0.0/0` to Network Access in Atlas |
