import { Router } from 'express';
import {
  getMe,
  login,
  logout,
  register,
  updateAvatar,
  updateProfile,
} from '../controllers/auth.controller';
import { accessMiddleware } from '../middlewares/access.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authRateLimit } from '../middlewares/rate-limit.middleware';
import { uploadAvatarMiddleware } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.get('/me', authMiddleware, accessMiddleware, getMe);
router.patch('/me', authMiddleware, accessMiddleware, updateProfile);
router.post(
  '/me/avatar',
  authMiddleware,
  accessMiddleware,
  uploadAvatarMiddleware.single('avatar'),
  updateAvatar,
);
router.post('/logout', authMiddleware, logout);

export default router;
