# ☕ Tunely - Tunnel Website Lokal Ke Internet

**100% Gratis & Open Source** - Tanpa ngrok, tunnel website lokal Anda ke internet dengan mudah!

## 📦 Apa Itu Tunely?

Tunely adalah tool untuk membuat website lokal Anda bisa diakses dari internet melalui HTTPS tunnel, tanpa perlu ngrok atau layanan berbayar lainnya.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run CLI Server
```bash
npm start
# atau
node cli.js
```

Ikuti petunjuk untuk memilih file HTML yang ingin di-tunnel.

### 3. Run Panel (Opsional)
```bash
npm run panel
# atau
node api-server.js
```

Kemudian buka `panel.html` di browser Anda.

## 🎯 CLI Mode (node cli.js)
- Scanning otomatis
- Pilih file HTML interaktif
- Custom domain support
- HTTPS tunnel
- Port otomatis

## 🎛️ Panel Mode (node api-server.js)
- Directory browser
- Server control
- Console with logs
- Performance monitoring
- Command executor

## 💻 Command Line Interface (CLI)

### Opsi Perintah

```bash
node cli.js [options]
```

| Opsi | Deskripsi |
|------|-----------|
| `--file <path>` | Otomatis pilih file HTML |
| `--name <name>` | Otomatis set subdomain |
| `--port <port>` | Spesifik port |
| `--auto-stop-ms <ms>` | Auto-stop (testing) |
| `--no-clear` | Jangan clear console |

## 🔧 API Endpoints

Jika ingin integrate dengan aplikasi lain:

### Base URL
```
http://127.0.0.1:4999
```

### Endpoints

#### 1. GET `/api/status`
```json
{
  "serverOn": true,
  "selectedFile": "index.html",
  "publicUrl": "https://example.loca.lt"
}
```

#### 2. GET `/api/files`
```json
{
  "files": ["index.html", "styles/main.css"]
}
```

#### 3. GET `/api/perf`
```json
{
  "cpu": 25,
  "ram": {"usedMB": 512, "percent": 6}
}
```

#### 4. GET `/api/logs`
```json
{
  "logs": [{"text": "Started", "type": "sys"}]
}
```

#### 5. POST `/api/cmd`
```json
{"cmd": "ls -la"}
```

#### 6. POST `/api/shutdown`
```json
{"serverOn": false}
```

## ⚙️ Configuration

### Panel Password (edit panel.html)
```javascript
const PASSWORD = "admin123";
```

### API Port (edit api-server.js)
```javascript
const API_PORT = 4999;
```

## 🛠️ Development

### Local Development
```bash
# Terminal 1
npm start

# Terminal 2
npm run panel

# Terminal 3: Open panel.html
```

### Running Both Servers

**Windows:**
```bash
run-servers.bat
```

**Mac/Linux:**
```bash
chmod +x run-servers.sh
./run-servers.sh
```

## 🐛 Troubleshooting

### Panel says "API tidak ditemukan"
- Pastikan `api-server.js` sudah running
- Check port 4999 tersedia
- Restart server

### Console commands tidak berfungsi
- Check API connection
- Pastikan command valid
- Check command timeout

### Port sudah terpakai
```bash
node cli.js --port 8000
```

## 📝 License

GNU Affero General Public License v3.0

## 🎁 Features

- [x] Website tunneling
- [x] Control panel
- [x] Performance monitoring
- [x] Command execution
- [ ] Database integration
- [ ] Multi-file tunnel
