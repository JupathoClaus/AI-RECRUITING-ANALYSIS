-- Set consent and submit all three applications
UPDATE "Application" 
SET "consentConfirmed" = true,
    status = 'SUBMITTED', 
    "currentStageId" = '794650f1-c98e-4512-832a-7ffff2020b8d',
    "submittedAt" = NOW(),
    "version" = 2,
    "updatedAt" = NOW()
WHERE id IN ('af4fdd9e-7e69-40da-9627-bb3aa93225ce', '575aa8e2-2bc7-4508-bf51-b17555c3f2c8', 'bc813a0a-e380-4b5e-9eee-8113905c44eb');
