import router from "./router/index.ts"; // 导入路由配置
import { createApp } from "vue";
import App from "./App.vue";
const app = createApp(App);
app.use(router);
app.mount("#app");
