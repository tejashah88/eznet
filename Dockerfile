FROM node:dubnium

WORKDIR /app

COPY package.json ./
RUN npm install --production
COPY . .

EXPOSE 8080
VOLUME /app

CMD [ "npm", "start" ]