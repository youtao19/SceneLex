import { Router } from 'express';
import {
  changePassword,
  deleteAccount,
  exportData,
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

// 下面三条都只挂 authMiddleware，不挂 accessMiddleware：账号到期或被停用的人
// 仍然要能改密码、导出自己的数据、注销账号。这三件事不消耗模型额度，拦住它们
// 只会把想离开的人困在系统里——而这恰恰是最不该拦的三种请求。
//
// 改密码要验旧口令，等于多了一个可以撞密码的入口，所以和登录共用同一档限流。
// authMiddleware 在前，限流因此按 user id 计数而不是按 IP。
router.post('/password', authMiddleware, authRateLimit, changePassword);
router.get('/export', authMiddleware, exportData);
router.delete('/account', authMiddleware, deleteAccount);

export default router;
