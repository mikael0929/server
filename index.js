// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const {
  initGameState,
  assignRole,
  updatePlayerPosition,
  findStartInMaze,
  findExitInMaze,
  findYStartInMaze
} = require("./gameState");

const originalMazes = [
  JSON.parse(fs.readFileSync(path.join(__dirname, "mazes/maze1.json"))),
  JSON.parse(fs.readFileSync(path.join(__dirname, "mazes/maze2.json"))),
  JSON.parse(fs.readFileSync(path.join(__dirname, "mazes/maze3.json"))),
  JSON.parse(fs.readFileSync(path.join(__dirname, "mazes/maze4.json"))),
];

function cloneMaze(index) {
  return JSON.parse(JSON.stringify(originalMazes[index]));
}

function bfsStepTowardsTarget(maze, start, target) {
  const queue = [[start]];
  const visited = new Set();
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const path = queue.shift();
    const { x, y } = path[path.length - 1];
    if (x === target.x && y === target.y) {
      return path;
    }
    const directions = [
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 }
    ];
    for (const { dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (
        ny >= 0 && ny < maze.length &&
        nx >= 0 && nx < maze[0].length &&
        (maze[ny][nx] === 0 || maze[ny][nx] === 2) &&
        !visited.has(`${nx},${ny}`)
      ) {
        visited.add(`${nx},${ny}`);
        queue.push([...path, { x: nx, y: ny }]);
      }
    }
  }
  return [];
}

const gameState = initGameState();
const firstMaze = cloneMaze(0);
gameState.maze = firstMaze;
gameState.playerPosition = findStartInMaze(firstMaze);
gameState.exitPosition = findExitInMaze(firstMaze);
gameState.yPosition = findYStartInMaze(firstMaze);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3001;

setInterval(() => {
  if (!gameState.yPosition) return;
  const path = bfsStepTowardsTarget(gameState.maze, gameState.yPosition, gameState.playerPosition);
  if (path.length > 1) {
    const steps = path.slice(1, 2);// 3-1 =2 2칸 까지 이동 가능
    gameState.yPosition = steps[steps.length - 1];
    if (
      gameState.yPosition.x === gameState.playerPosition.x &&
      gameState.yPosition.y === gameState.playerPosition.y
    ) {
      console.log("☠️ Y caught X! Resetting game...");
      const currentMaze = cloneMaze(gameState.mazeIndex);
      gameState.maze = currentMaze;
      gameState.playerPosition = findStartInMaze(currentMaze);
      gameState.exitPosition = findExitInMaze(currentMaze);
      gameState.yPosition = findYStartInMaze(currentMaze);
      io.emit("init-maze", gameState.maze);
      io.emit("game-state", gameState);
    } else {
      io.emit("game-state", gameState);
    }
  }
}, 400);

io.on("connection", (socket) => {
  console.log("👤 New player connected:", socket.id);

  socket.emit("game-state", gameState);
  socket.emit("init-maze", gameState.maze);

  socket.on("join-as", (requestedRole) => {
    const taken = gameState.players.find((p) => p.role === requestedRole);
    if (!taken) {
      gameState.players.push({ id: socket.id, role: requestedRole });
      socket.emit("role-assigned", requestedRole);
      console.log(`✅ ${socket.id} joined as ${requestedRole}`);
    } else {
      socket.emit("role-taken", requestedRole);
      console.log(`❌ Role ${requestedRole} already taken.`);
    }
  });

  socket.on("move", (data) => {
    const player = gameState.players.find((p) => p.id === socket.id);
    if (player) {
      updatePlayerPosition(gameState, player.role, data.direction);
      const { x, y } = gameState.playerPosition;
      const { x: exitX, y: exitY } = gameState.exitPosition;
      const reachedExit = x === exitX && y === exitY;

      if (
      gameState.yPosition &&
      gameState.playerPosition.x === gameState.yPosition.x &&
      gameState.playerPosition.y === gameState.yPosition.y
    ) {
      console.log("☠️ X ran into Y! Resetting game...");
      const currentMaze = cloneMaze(gameState.mazeIndex);
      gameState.maze = currentMaze;
      gameState.playerPosition = findStartInMaze(currentMaze);
      gameState.exitPosition = findExitInMaze(currentMaze);
      gameState.yPosition = findYStartInMaze(currentMaze);
      io.emit("init-maze", gameState.maze);
      io.emit("game-state", gameState);
      return; // 충돌 후 종료
    }

      if (reachedExit) {
        console.log("🎉 미로 탈출 성공!");
        gameState.mazeIndex++;

        if (gameState.mazeIndex < originalMazes.length) {
          const newMaze = cloneMaze(gameState.mazeIndex);
          gameState.maze = newMaze;
          gameState.playerPosition = findStartInMaze(newMaze);
          gameState.exitPosition = findExitInMaze(newMaze);
          gameState.yPosition = findYStartInMaze(newMaze);
          io.emit("init-maze", gameState.maze);
          io.emit("game-state", gameState);
        } else {
          console.log("🏁 모든 미로 클리어! 게임 종료!");
          io.emit("game-clear");
          const resetMaze = cloneMaze(0);
          gameState.mazeIndex = 0;
          gameState.maze = resetMaze;
          gameState.playerPosition = findStartInMaze(resetMaze);
          gameState.exitPosition = findExitInMaze(resetMaze);
          gameState.yPosition = findYStartInMaze(resetMaze);
        }
      } else {
        io.emit("game-state", gameState);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Player disconnected:", socket.id);
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
  });

  socket.on("leave-role", (role) => {
    gameState.players = gameState.players.filter((p) => p.id !== socket.id);
    console.log(`↩️ ${socket.id} left role ${role}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
