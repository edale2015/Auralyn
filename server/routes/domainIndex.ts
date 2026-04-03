import { Router } from 'express';
import clinicalRouter from './clinicalRouter';
import billingRouter from './billingRouter';
import learningRouter from './learningRouter';
import agentDomainRouter from './agentDomainRouter';
import adminDomainRouter from './adminDomainRouter';
import observabilityRouter from './observabilityRouter';
import authDomainRouter from './authDomainRouter';
import integrationsDomainRouter from './integrationsDomainRouter';

export function buildDomainRouters(): Router {
  const router = Router();
  router.use('/clinical-domain', clinicalRouter);
  router.use('/billing-domain', billingRouter);
  router.use('/learning-domain', learningRouter);
  router.use('/agents-domain', agentDomainRouter);
  router.use('/admin-domain', adminDomainRouter);
  router.use('/observability', observabilityRouter);
  router.use('/auth-domain', authDomainRouter);
  router.use('/integrations-domain', integrationsDomainRouter);
  return router;
}
