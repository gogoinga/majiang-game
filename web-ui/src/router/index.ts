import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory("xiucaozuo"),
  routes: [
    {
      path: "/home",
      name: "home",
      component: () => import("@/pages/game-index/index.vue"),
    },
  ],
});

// 设置路由守卫
router.beforeEach((to: any, from: any, next: any) => {
  // 如果访问的是根路径 `/`，则重定向到 `/home/index`
  if (to.path === "/") {
    next("/home");
  } else {
    next();
  }
});

export default router;
