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
  findYStartInMaze,
  findAllYStartsInMaze
} = require("./gameState");



const originalMazes = Array.from({ length: 10 }, (_, i) =>
  JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, `mazes/maze${i + 1}.json`)))))
);

function cloneMaze(index) {
  return JSON.parse(JSON.stringify(originalMazes[index]));
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
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
        (maze[ny][nx] === 0 || maze[ny][nx] === 2 || maze[ny][nx] === 3) &&
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
gameState.yPositions = findAllYStartsInMaze(firstMaze);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3001;

let tick = 0;
setInterval(() => {
  tick++;

  // 🎯 3번 출구는 매 초마다 움직이게
  if (tick % 3 === 0) {
    if (gameState.maze[gameState.exitPosition.y][gameState.exitPosition.x] === 3) {
      const exit = gameState.exitPosition;
      const directions = [
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
      ];

      let bestMove = exit;
      let maxDistance = distance(exit, gameState.playerPosition);

      for (const { dx, dy } of directions) {
        const nx = exit.x + dx;
        const ny = exit.y + dy;

        if (
          ny >= 0 && ny < gameState.maze.length &&
          nx >= 0 && nx < gameState.maze[0].length &&
          gameState.maze[ny][nx] === 0
        ) {
          const d = distance({ x: nx, y: ny }, gameState.playerPosition);
          if (d > maxDistance) {
            maxDistance = d;
            bestMove = { x: nx, y: ny };
          }
        }
      }

      if (bestMove.x !== exit.x || bestMove.y !== exit.y) {
        gameState.maze[exit.y][exit.x] = 0;
        gameState.maze[bestMove.y][bestMove.x] = 3;
        gameState.exitPosition = bestMove;
      }
    }
  }

  
    if (!gameState.yPositions || gameState.yPositions.length === 0) return;

  for (const yPos of gameState.yPositions) {
    const path = bfsStepTowardsTarget(gameState.maze, yPos, gameState.playerPosition);
    if (path.length > 1) {
      const nextStep = path[1];
      if (nextStep.x === gameState.playerPosition.x && nextStep.y === gameState.playerPosition.y) {
        console.log("☠️ Y caught X during interval! Resetting game...");
        const resetMaze = cloneMaze(gameState.mazeIndex);
        gameState.maze = resetMaze;
        gameState.playerPosition = findStartInMaze(resetMaze);
        gameState.exitPosition = findExitInMaze(resetMaze);
        gameState.yPositions = findAllYStartsInMaze(resetMaze);
        io.emit("init-maze", gameState.maze);
        io.emit("game-state", gameState);
        return;
      }
    }
  }
  
  if (tick % 6 === 0)
  {
    const updatedYPositions = gameState.yPositions.map((yPos) => {
    const path = bfsStepTowardsTarget(gameState.maze, yPos, gameState.playerPosition);
    return path.length > 1 ? path[1] : yPos;
  });

  // ✅ Y가 X와 충돌했는지 검사 (이동 후)
for (const newY of updatedYPositions) {
  if (newY.x === gameState.playerPosition.x && newY.y === gameState.playerPosition.y) {
    console.log("☠️ Y collided with X after moving!");
    const resetMaze = cloneMaze(gameState.mazeIndex);
    gameState.maze = resetMaze;
    gameState.playerPosition = findStartInMaze(resetMaze);
    gameState.exitPosition = findExitInMaze(resetMaze);
    gameState.yPositions = findAllYStartsInMaze(resetMaze);
    io.emit("init-maze", gameState.maze);
    io.emit("game-state", gameState);
    return;
    }
  }
  gameState.yPositions = updatedYPositions;
  io.emit("game-state", gameState);
  }}, 100); // 루프는 1초마다 돌고, 내부에서 분기처리로 속도 차이 구현


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

    
    const result = updatePlayerPosition(gameState, player.role, data.direction);
    const { isValid, newX, newY } = result;
    const currentCell = gameState.maze[newY]?.[newX];
    //const currentCell = gameState.maze[y][x];

    const { x, y } = gameState.playerPosition;
    const { x: exitX, y: exitY } = gameState.exitPosition;
    const cell = gameState.maze[y][x];  // 현재 플레이어 위치의 셀 값
    const isExitCell = cell === 2 || cell === 3;
    const reachedExit = isExitCell;  // 셀 자체가 출구인지 확인

    if (gameState.mazeIndex <= 6 && !isValid && gameState.maze[newY]?.[newX] === 1) {
      if (!isValid){
        console.log("🧱 벽(1)에 닿아서 리셋됩니다!");

        const resetMaze = cloneMaze(gameState.mazeIndex);
        gameState.maze = resetMaze;
        gameState.playerPosition = findStartInMaze(resetMaze);
        gameState.exitPosition = findExitInMaze(resetMaze);
        gameState.yPositions = findAllYStartsInMaze(resetMaze);

      }
    io.emit("init-maze", gameState.maze);
    io.emit("game-state", gameState);
    return;
    }
    // ✅ 여기서 충돌 감지 및 전체 리셋
    if (
      gameState.yPositions.some(
        (y) => y.x === newX && y.y === newY
      )
    ) {
      console.log("☠️ X ran into Y! Resetting game...");

      const resetMaze = cloneMaze(gameState.mazeIndex);
      gameState.maze = resetMaze;
      gameState.playerPosition = findStartInMaze(resetMaze);
      gameState.exitPosition = findExitInMaze(resetMaze);
      gameState.yPositions = findAllYStartsInMaze(resetMaze);

      io.emit("init-maze", gameState.maze);
      io.emit("game-state", gameState);
      return;
    }

      if (reachedExit) {
        console.log("🎉 미로 탈출 성공!");
        gameState.mazeIndex++;

        if (gameState.mazeIndex < originalMazes.length) {
          const newMaze = cloneMaze(gameState.mazeIndex);
          gameState.maze = newMaze;
          gameState.playerPosition = findStartInMaze(newMaze);
          gameState.exitPosition = findExitInMaze(newMaze);
          gameState.yPositions = findAllYStartsInMaze(newMaze);
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
          gameState.yPositions = findAllYStartsInMaze(resetMaze);
        }
      } else {
        io.emit("game-state", gameState);
      }
    }
  });

  socket.on("restart-first-maze", () => {
  if (!gameState) return;
  const resetMaze = cloneMaze(0);
  gameState.mazeIndex = 0;
  gameState.maze = resetMaze;
  gameState.playerPosition = findStartInMaze(resetMaze);
  gameState.exitPosition = findExitInMaze(resetMaze);
  gameState.yPositions = findAllYStartsInMaze(resetMaze);
  io.emit("init-maze", gameState.maze);
  io.emit("game-state", gameState);
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
  console.log("✅ 초기 출구 위치:", gameState.exitPosition);
  console.log("✅ 해당 좌표 maze 값:", gameState.maze[gameState.exitPosition.y][gameState.exitPosition.x]);

});
