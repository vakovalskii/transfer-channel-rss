FROM node:22-alpine
WORKDIR /app
RUN npm install -g tsx
COPY index.ts ./
EXPOSE 3001
ENV PORT=3001
CMD ["tsx", "index.ts"]
