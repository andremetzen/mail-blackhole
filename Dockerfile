FROM mhart/alpine-node:base

WORKDIR /src
ADD . .

# If you have native dependencies, you'll need extra tools
# RUN apk add --no-cache make gcc g++ python

# RUN npm install

EXPOSE 1025
EXPOSE 1080
CMD ["node", "server.js"]