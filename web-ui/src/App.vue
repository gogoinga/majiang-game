<template>
  <div class="root">
    <RouterView></RouterView>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
</script>

<style scoped>
.root {
  width: 100vw;
  height: 100vh;
  font-size: 28px;
}
</style>
