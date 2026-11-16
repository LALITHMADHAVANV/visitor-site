import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessionUser } from '@/lib/gate-session';
import { staffRow, gateRow, visitorRow } from '@/lib/hr-reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await sessionUser(request, { allowLegacyGateHeader: false });
  if (!user || !['ADMIN', 'HR'].includes(user.role)) {
    return NextResponse.json({ error: 'HR or administrator login required.' }, { status: 403 });
  }
  try {
    await db.sync();
    return NextResponse.json({
      staff: db.getRequests().filter(row => row.type !== 'VISITOR').map(staffRow),
      gate: db.getGateLogs().filter(row => row.type !== 'VISITOR').map(gateRow),
      visitors: db.getVisitors().map(visitorRow),
      updatedAt: new Date().toISOString()
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to load HR activity reports', error);
    return NextResponse.json({ error: 'Unable to load reports. Please retry.' }, { status: 500 });
  }
}
