import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory("xiucaozuo"),
  routes: [
    {
      path: "/rooms",
      name: "rooms",
      component: () => import("@/pages/room-lobby/index.vue"),
    },
    {
      path: "/room/:roomId",
      name: "game-room",
      component: () => import("@/pages/game-index/index.vue"),
    },
    {
      path: "/home",
      redirect: "/rooms",
    },
  ],
});

// 设置路由守卫
router.beforeEach((to: any, from: any, next: any) => {
  // 如果访问的是根路径 `/`，则重定向到房间大厅
  if (to.path === "/") {
    next("/rooms");
  } else {
    next();
  }
});

export default router;
