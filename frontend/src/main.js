import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import 'vue-sonner/style.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue') },
    { path: '/dashboard', component: () => import('./views/Dashboard.vue'), meta: { auth: true } },
    { path: '/chat', component: () => import('./views/ChatWorkspace.vue'), props: route => ({ sessionId: typeof route.query.session === 'string' ? route.query.session : '' }), meta: { auth: true } },
    { path: '/chat/fullscreen', component: () => import('./views/ChatWorkspace.vue'), props: route => ({ fullscreen: true, sessionId: typeof route.query.session === 'string' ? route.query.session : '' }), meta: { auth: true, chatOnly: true } },
    { path: '/models', component: () => import('./views/Models.vue'), meta: { auth: true } },
    { path: '/keys', component: () => import('./views/GatewayKeys.vue'), meta: { auth: true } },
    { path: '/pool', component: () => import('./views/UpstreamPool.vue'), meta: { auth: true } },
    { path: '/logs', component: () => import('./views/Logs.vue'), meta: { auth: true } },
    { path: '/images', component: () => import('./views/MediaLibrary.vue'), props: { kind: 'image' }, meta: { auth: true } },
    { path: '/videos', component: () => import('./views/MediaLibrary.vue'), props: { kind: 'video' }, meta: { auth: true } },
    { path: '/settings', component: () => import('./views/Settings.vue'), meta: { auth: true } },
    { path: '/', redirect: '/dashboard' },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const token = localStorage.getItem('agnes_admin_token')
  if (to.meta.auth && !token) return '/login'
  if (to.path === '/login' && token) return '/dashboard'
})

createApp(App).use(router).mount('#app')
