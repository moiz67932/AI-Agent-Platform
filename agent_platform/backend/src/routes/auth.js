import { Router } from 'express';

const router = Router();

router.get('/me', async (req, res) => {
  const metadata = req.user?.user_metadata || {};

  res.json({
    data: {
      user: {
        id: req.user.id,
        email: req.user.email || '',
        full_name: metadata.full_name || req.user.email || '',
        avatar_url: metadata.avatar_url || null,
      },
      org: req.org || null,
      role: req.userRole || 'owner',
      onboarding_completed: Boolean(req.orgId),
    },
  });
});

export default router;
