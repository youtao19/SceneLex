import { Router } from 'express';
import {
  createAccessKey,
  listAccessKeys,
  listUsers,
  updateAccessKey,
  updateUserAccess,
  updateUserRole,
  updateUserVip,
} from '../controllers/admin.controller';

const router = Router();

router.get('/users', listUsers);
router.patch('/users/:userId/access', updateUserAccess);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/vip', updateUserVip);
router.get('/access-keys', listAccessKeys);
router.post('/access-keys', createAccessKey);
router.patch('/access-keys/:accessKeyId', updateAccessKey);

export default router;
