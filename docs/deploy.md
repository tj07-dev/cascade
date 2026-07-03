# AWS EC2 Deployment Runbook

This runbook provides step-by-step instructions for deploying the DownloadX application on AWS EC2 in the Mumbai region (ap-south-1) with SSL/TLS encryption via Let's Encrypt.

---

## Prerequisites

- AWS Account with EC2 access
- GoDaddy domain registered and accessible
- Local machine with SSH client (Mac, Linux, or Windows with WSL)
- Email address for SSL certificate registration

---

## Part 1: AWS EC2 Instance Setup

### Step 1: Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**

2. **Name:** `downloadx`

3. **AMI Selection:**
   - Search for and select **Amazon Linux 2023** (free tier eligible)

4. **Instance Type:**
   - Select `t3.micro` (free tier eligible)

5. **Key Pair:**
   - Click **Create new key pair**
   - Name: `downloadx`
   - Type: RSA
   - Format: .pem
   - **Download** the `.pem` file and save to `~/.ssh/downloadx.pem`
   - Set permissions: `chmod 400 ~/.ssh/downloadx.pem`

6. **Network & Security:**
   - Create a new Security Group (or select existing) with inbound rules:
     - **SSH (Port 22):** Source = Your IP (or 0.0.0.0/0 at your risk)
     - **HTTP (Port 80):** Source = 0.0.0.0/0 (Anywhere)
     - **HTTPS (Port 443):** Source = 0.0.0.0/0 (Anywhere)

7. **Storage:**
   - Size: **20 GB**
   - Type: **gp3** (General Purpose SSD)
   - Delete on Termination: ✓

8. **Launch Instance**

   Note your Instance ID and Public IP address (or DNS name).

---

### Step 2: Allocate and Associate Elastic IP

The instance's public IP will change if stopped/restarted. Use an Elastic IP for permanent access.

1. Go to **AWS Console → EC2 → Elastic IPs**

2. **Allocate new address:**
   - Scope: VPC
   - Public IPv4 address pool: Amazon's pool of addresses
   - Click **Allocate**

3. **Associate address:**
   - Select the Elastic IP just created
   - Associate with your `downloadx` instance
   - Private IP: Select the instance's private IP
   - Click **Associate**

4. **Note the Elastic IP address** (e.g., `13.201.100.50`) — you'll need this for DNS.

---

### Step 3: Configure Security Group

Verify your Security Group has the following inbound rules:

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | Your IP / 0.0.0.0/0 | SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Certificate validation & HTTP redirect |
| HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS traffic |

---

## Part 2: DNS Configuration

### Step 4: GoDaddy DNS Setup

Wait 2-3 minutes for the Elastic IP to fully associate, then configure DNS.

1. Go to **GoDaddy → My Products → Domain → DNS**

2. **Add A records:**

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | @ | `<Elastic_IP>` | 600 |
   | A | www | `<Elastic_IP>` | 600 |

   (Replace `<Elastic_IP>` with your actual Elastic IP, e.g., `13.201.100.50`)

3. **Save changes**

4. **Verify DNS propagation** (5-10 minutes):

   ```bash
   # From your local machine:
   nslookup yourdomain.com
   # Should return your Elastic IP
   
   dig yourdomain.com
   # Confirm A record resolves to your Elastic IP
   ```

---

## Part 3: EC2 Server Configuration

### Step 5: SSH Into Instance and Install Dependencies

```bash
# From your local machine:
chmod 400 ~/.ssh/downloadx.pem
ssh -i ~/.ssh/downloadx.pem ec2-user@<Elastic_IP>
# Or use your domain once DNS propagates:
# ssh -i ~/.ssh/downloadx.pem ec2-user@yourdomain.com
```

Once connected to the EC2 instance, run:

```bash
# Update system packages
sudo yum update -y

# Install git and docker
sudo yum install -y git docker

# Start docker service and enable on boot
sudo systemctl enable docker
sudo systemctl start docker

# Add ec2-user to docker group (to run docker without sudo)
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Verify installations
docker --version
docker compose version
git --version
```

**Re-login to apply docker group membership:**

```bash
exit
ssh -i ~/.ssh/downloadx.pem ec2-user@<Elastic_IP>
```

---

### Step 6: Clone Repository and Configure Domain

```bash
# Clone the repository
git clone https://github.com/yourusername/download-x.git download-x
cd download-x

# Replace placeholder with your actual domain in nginx.conf
sed -i 's/YOUR_DOMAIN_HERE/yourdomain.com/g' nginx.conf

# Verify the change
grep yourdomain.com nginx.conf
# Should show two lines with your domain
```

---

## Part 4: SSL Certificate and Stack Deployment

### Step 7: Obtain SSL Certificate via Certbot

The DownloadX stack requires SSL/TLS encryption. We'll use Let's Encrypt with certbot.

**Start nginx first** (without the app) for ACME challenge validation:

```bash
docker compose up -d nginx
# Wait 5 seconds for nginx to start
sleep 5
```

**Install certbot on the EC2 instance:**

```bash
sudo yum install -y certbot
```

**Obtain SSL certificate** (webroot method):

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --non-interactive \
  --agree-tos \
  -m your-email@example.com \
  --rsa-key-size 2048
```

**Verify certificate creation:**

```bash
sudo ls -la /etc/letsencrypt/live/yourdomain.com/
# Should show: fullchain.pem, privkey.pem, etc.
```

---

### Step 8: Start Full Stack

Now start the complete application stack:

```bash
# Build and start all services
docker compose up -d --build

# Wait ~3 minutes for the app build to complete
sleep 30

# Check service status
docker compose ps
# Expected output:
# NAME                COMMAND             STATUS
# downloadx-app-1     "npm start"         Up X minutes
# downloadx-nginx-1   "nginx -g..."       Up X minutes
```

---

## Part 5: Verification

### Step 9: Verify Application Deployment

Test the application from your local machine:

```bash
# Test HTTPS homepage
curl https://yourdomain.com
# Should return HTML with "DownloadX" or application content

# Test HTTP redirect (should see redirect to HTTPS)
curl -I http://yourdomain.com
# Should return: 301 Moved Permanently with Location: https://yourdomain.com
```

**Test API Endpoint:**

```bash
# Test /api/info with a YouTube URL
curl -X POST https://yourdomain.com/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Expected response (JSON):
# {
#   "title": "Rick Astley - Never Gonna Give You Up...",
#   "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/...",
#   "duration": 213,
#   "formats": [...]
# }
```

**Test Download Endpoint:**

```bash
# Generate a download URL
curl -X POST https://yourdomain.com/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"best"}' \
  -o download.mp4

# Should initiate download
```

---

## Part 6: SSL Auto-Renewal

### Step 10: Configure Automatic Certificate Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

**On the EC2 instance:**

```bash
# Edit root crontab
sudo crontab -e
```

**Add this line to run weekly renewal check (Sunday at midnight):**

```cron
0 0 * * 0 certbot renew --quiet && docker compose -f /home/ec2-user/download-x/docker-compose.yml restart nginx
```

**Verify cron entry:**

```bash
sudo crontab -l
# Should show the renewal line
```

**Test renewal process** (without actually renewing):

```bash
sudo certbot renew --dry-run
# Should complete without errors
```

---

## Part 7: Operations & Maintenance

### Step 11: Update Application

Pull the latest code and redeploy:

```bash
# SSH into the instance
ssh -i ~/.ssh/downloadx.pem ec2-user@yourdomain.com

# Navigate to application directory
cd ~/download-x

# Pull latest changes
git pull origin main

# Rebuild and restart services
docker compose up -d --build

# Verify deployment
docker compose ps
docker compose logs app --tail 20
```

### Step 12: View Logs

Monitor application and nginx logs in real-time:

```bash
# Application logs
docker compose logs app -f

# Nginx logs (in a separate terminal)
docker compose logs nginx -f

# Both services
docker compose logs -f

# View last N lines
docker compose logs --tail 50
```

### Restart Services

Restart all services:

```bash
docker compose restart
```

Restart specific service:

```bash
# Restart only the app
docker compose restart app

# Restart only nginx
docker compose restart nginx
```

### Check and Update yt-dlp

yt-dlp is the media download engine. YouTube frequently updates anti-scraping measures, so keeping yt-dlp current is critical.

**Check current version:**

```bash
docker compose exec app yt-dlp --version
# Output: 2024.01.16 (or later version)
```

**Update to latest version:**

```bash
docker compose exec app pip install -U yt-dlp

# Verify update
docker compose exec app yt-dlp --version
```

### View Application Logs During Downloads

```bash
# Real-time application logs (useful during downloads)
docker compose logs app -f

# Watch for "Download completed" or error messages
```

### Restart Nginx

If you modify the nginx configuration:

```bash
docker compose exec nginx nginx -s reload
# Or full restart:
docker compose restart nginx
```

### Check Disk Space

The application stores temporary download files. Monitor disk space:

```bash
df -h /
# If > 90% full, clean up old downloads or increase storage
```

### Stop the Stack

To temporarily stop all services (preserves data):

```bash
docker compose stop
```

### Restart the Stack

```bash
docker compose start
```

### View Resource Usage

```bash
docker stats
# Shows CPU, memory, network usage for all containers
```

---

## Troubleshooting

### Certificate Issues

**If you get "Certificate verification failed":**

```bash
# Check certificate validity
sudo certbot certificates

# Manual renewal
sudo certbot renew --force-renewal

# Restart nginx
docker compose restart nginx
```

### Application Won't Start

```bash
# Check application logs
docker compose logs app

# Restart the app
docker compose restart app

# Check if port 3000 is available
netstat -tulpn | grep 3000
```

### DNS Not Resolving

```bash
# Clear DNS cache (macOS)
sudo dscacheutil -flushcache

# Check DNS resolution
nslookup yourdomain.com
dig yourdomain.com +short

# Check GoDaddy settings - verify A records are correctly set
```

### Docker Issues

```bash
# Check docker daemon status
sudo systemctl status docker

# Restart docker service
sudo systemctl restart docker

# View docker system information
docker info
```

---

## Security Notes

1. **SSH Access:** Restrict SSH to your IP address when possible (edit Security Group)
2. **Backups:** Regularly back up your application data and SSL certificates
3. **Updates:** Keep the OS, Docker, and dependencies current
   ```bash
   sudo yum update -y
   ```
4. **Logs:** Monitor logs regularly for errors or suspicious activity
5. **SSL:** Certificates are renewed automatically; verify renewal works

---

## Cost Optimization

- **t3.micro:** Free tier eligible (AWS free tier = 750 hours/month)
- **20GB gp3:** Free tier includes 30GB; we use 20GB (small margin for safety)
- **Elastic IP:** Free while associated with running instance; $0.005/hour if unassociated
- **Data Transfer:** First 1GB outbound/month is free; after that ~$0.09/GB

For typical usage (downloads ~500MB/month), monthly cost should stay under **$1-2**.

---

## Emergency Recovery

### Restore from Backup (if applicable)

```bash
# If you have backed up application data
rsync -avz /backup/download-x /home/ec2-user/
cd /home/ec2-user/download-x
docker compose up -d
```

### Restore SSL Certificates (if applicable)

```bash
# If you backed up /etc/letsencrypt
sudo rsync -avz /backup/letsencrypt /etc/
docker compose restart nginx
```

### Completely Redeploy (nuclear option)

```bash
# Stop all services
docker compose down

# Remove all volumes (WARNING: deletes data)
docker compose down -v

# Redeploy fresh
git pull
docker compose up -d --build
```

---

## Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [GoDaddy DNS Documentation](https://www.godaddy.com/help)

---

**Last Updated:** 2026-07-04  
**Version:** 1.0
