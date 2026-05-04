import { createRouter, createWebHistory } from 'vue-router';
import LandingView from '../views/LandingView.vue';
import HomeView from '../views/HomeView.vue';
import HistoryView from '../views/HistoryView.vue';
import ReadingView from '../views/ReadingView.vue';
import ReviewView from '../views/ReviewView.vue';
import SettingsView from '../views/SettingsView.vue';
import ProfileView from '../views/ProfileView.vue';
import WordBooksView from '../views/WordBooksView.vue';
import SystemWordBooksView from '../views/SystemWordBooksView.vue';
import { AUTH_STORAGE_KEY, type AuthState } from '../types/auth';
import { readFromStorage } from '../utils/storage';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView, meta: { guestOnly: true } },
    { path: '/dashboard', name: 'dashboard', component: HomeView, meta: { requiresAuth: true } },
    { path: '/reading', name: 'reading', component: ReadingView, meta: { requiresAuth: true } },
    { path: '/review', name: 'review', component: ReviewView, meta: { requiresAuth: true } },
    { path: '/study-books', name: 'study-books', component: SystemWordBooksView, meta: { requiresAuth: true } },
    { path: '/history', name: 'history', component: HistoryView, meta: { requiresAuth: true } },
    { path: '/word-books', name: 'word-books', component: WordBooksView, meta: { requiresAuth: true } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const authState = readFromStorage<AuthState>(AUTH_STORAGE_KEY);
  const isAuthenticated = Boolean(authState?.token && authState.user);
  const requiresAuth = Boolean(to.meta.requiresAuth);
  const guestOnly = Boolean(to.meta.guestOnly);

  if (requiresAuth && !isAuthenticated) {
    return { name: 'landing' };
  }

  if (guestOnly && isAuthenticated) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
