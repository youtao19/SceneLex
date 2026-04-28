import { Router } from 'express';
import {
  getMe,
  login,
  logout,
  register,
  updateProfile,
} from '../controllers/auth.controller';
import { accessMiddleware } from '../middlewares/access.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, accessMiddleware, getMe);
router.patch('/me', authMiddleware, accessMiddleware, updateProfile);
router.post('/logout', authMiddleware, logout);

export default router;
