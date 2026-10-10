import { Router } from 'express';
import {
  createAccessKey,
  deleteSystemEndpoint,
  getSystemEndpoint,
  getUsageOverview,
  listAccessKeys,
  listUsers,
  saveSystemEndpoint,
  testSystemEndpoint,
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
router.get('/usage', getUsageOverview);
router.get('/system-endpoint', getSystemEndpoint);
router.patch('/system-endpoint', saveSystemEndpoint);
router.delete('/system-endpoint', deleteSystemEndpoint);
router.post('/system-endpoint/test', testSystemEndpoint);
router.get('/access-keys', listAccessKeys);
router.post('/access-keys', createAccessKey);
router.patch('/access-keys/:accessKeyId', updateAccessKey);

export default router;
