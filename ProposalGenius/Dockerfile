FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=100:101 . .

# Der zentrale Polymath-Service-Account ist auf dem Host nur für uid/gid
# 100:101 lesbar. Die Ownership wird bereits beim Kopieren gesetzt, damit kein
# teurer rekursiver Ownership-Scan im Image-Build nötig ist.
RUN chmod 775 /app/public
USER 100:101

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.js"]
