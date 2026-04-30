import { createApp, computed, ref, defineAsyncComponent, watch} from "vue";
import { createRouter, createWebHashHistory, useRoute, useRouter } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { createPinia, defineStore } from "pinia"

function loadComponent(name) {
  return () => import(`./Pages/${name}.js`).then((m) => m.default());
}

export function delay(ms = 1000) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
}




const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/login" },
    { path: "/login", name: "login", component: loadComponent("login") },
    { path: "/home", name: "home", component: loadComponent("home"), meta: { requiresAuth: true } },
    { path: "/chat/:chatId", name: "chat", component: loadComponent("home"), meta: { requiresAuth: true } },
    { path: "/profile/:actor", component: loadComponent("profile"), props: true, meta: { requiresAuth: true } },
  ],
});

function setup(){
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const route = useRoute();
    const router = useRouter();
    watch(
        () => [session.value, route.fullPath],
        () => {
        if (!session.value && route.meta.requiresAuth) {
            router.replace({
            name: "login",
            query: { redirect: route.fullPath },
            });
        }
        if (session.value && route.name === "login") {
            router.replace(route.query.redirect || { name: "home" });
        }
        },
        { immediate: true },
    );
    return {};
}


const pinia = createPinia()
const app = createApp({
  template: "#template",
  setup,
});
app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith("wa-");
app
.use(pinia)
.use(router)
.use(GraffitiPlugin, {
  // graffiti: new GraffitiLocal(),
  graffiti: new GraffitiDecentralized(),
})
.mount('#app')
