FROM node:20-alpine

WORKDIR /app

COPY worker/package.json ./
RUN npm install --omit=dev

COPY worker ./

CMD ["npm", "start"]
