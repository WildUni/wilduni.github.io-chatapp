// ============================================================
// IMPORTS - Core Framework Dependencies
// ============================================================
import { createApp, computed, ref, defineAsyncComponent, watch } from "vue";
import { createRouter, createWebHashHistory, useRoute, useRouter } from "vue-router";

// ============================================================
// IMPORTS - Graffiti (Decentralized Data Management)
// ============================================================
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

// ============================================================
// IMPORTS - State Management (Pinia)
// ============================================================
import { createPinia, defineStore } from "pinia"

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Dynamically load page components on demand (lazy loading)
 * @param {string} name - The name of the page component to load
 * @returns {Function} A function that returns the imported component
 */
function loadComponent(name) {
  return () => import(`./Pages/${name}.js`).then((m) => m.default());
}

/**
 * Create a delay/pause in execution using a Promise
 * Useful for timing operations or debouncing actions
 * @param {number} ms - Milliseconds to delay (default: 1000ms)
 * @returns {Promise} Promise that resolves after the specified delay
 */
export function delay(ms = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// ============================================================
// ROUTER CONFIGURATION - Define Application Routes
// ============================================================
const router = createRouter({
  history: createWebHashHistory(), // Use hash-based routing (URL format: /#/path)
  routes: [
    // Default route redirects to login
    { path: "/", redirect: "/login" },
    
    // Authentication Pages
    { 
      path: "/login", 
      name: "login", 
      component: loadComponent("login") 
    },
    
    // Protected Pages (require authentication)
    { 
      path: "/home", 
      name: "home", 
      component: loadComponent("home"), 
      meta: { requiresAuth: true } 
    },
    
    // Chat Details Page (with dynamic chat ID)
    { 
      path: "/chat/:chatId", 
      name: "chat", 
      component: loadComponent("home"), 
      meta: { requiresAuth: true } 
    },
    
    // User Profile Page (with dynamic user actor ID)
    { 
      path: "/profile/:actor", 
      component: loadComponent("profile"), 
      props: true, 
      meta: { requiresAuth: true } 
    },
  ],
});

// ============================================================
// AUTHENTICATION & NAVIGATION SETUP
// ============================================================

/**
 * Setup authentication guard and route protection
 * Redirects unauthenticated users to login
 * Redirects authenticated users away from login page
 */
function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession(); // Track user session state
  const route = useRoute();
  const router = useRouter();
  
  // Watch for changes in session or route
  watch(
    () => [session.value, route.fullPath],
    () => {
      // Redirect to login if user is not authenticated but route requires auth
      if (!session.value && route.meta.requiresAuth) {
        router.replace({
          name: "login",
          query: { redirect: route.fullPath }, // Save original destination
        });
      }
      
      // Redirect to home (or saved location) if user is authenticated and viewing login
      if (session.value && route.name === "login") {
        router.replace(route.query.redirect || { name: "home" });
      }
    },
    { immediate: true } // Run check immediately on app load
  );
  
  return {};
}

// ============================================================
// APP INITIALIZATION - Create and Configure Vue App
// ============================================================

// Create Pinia store for global state management
const pinia = createPinia();

// Create Vue app instance
const app = createApp({
  template: "#template", // Use template from index.html
  setup,
});

// Allow custom "wa-" Web Awesome components in templates
app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith("wa-");

// Register plugins and mount application
app
  .use(pinia) // State management
  .use(router) // Routing
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(), // Use local storage (development)
    // graffiti: new GraffitiDecentralized(), // Uncomment to use decentralized network
  })
  .mount('#app'); // Mount to DOM element with id="app"
