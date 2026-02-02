import { NextApiRequest, NextApiResponse } from 'next';

interface DebugResponse {
  vercelEnv: string;
  nodeEnv: string;
}

export default function handler(req: NextApiRequest, res: NextApiResponse<DebugResponse>) {
  const response = {
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV || 'undefined',
    nodeEnv: process.env.NODE_ENV || 'undefined',
  };

  res.status(200).json(response);
}
