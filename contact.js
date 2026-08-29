/**
 * 문의 폼 수신 엔드포인트
 * 경로: POST /api/contact
 *
 * Cloudflare Pages 대시보드 > 설정 > 환경 변수에 아래를 등록하세요.
 *   RESEND_API_KEY  : Resend(resend.com) API 키. 무료 플랜으로 충분합니다.
 *   MAIL_TO         : 문의를 받을 주소  (예: sdj1011@hanmail.net)
 *   MAIL_FROM       : 발신 주소. Resend에 인증한 도메인이어야 합니다.
 *                     (예: no-reply@dreamdoctor.co.kr)
 *
 * 환경 변수를 등록하지 않아도 폼은 정상 접수됩니다.
 * 다만 메일이 발송되지 않고 서버 로그에만 남으므로, 실제 운영 전에 반드시 등록하세요.
 */

const esc = (v) =>
  String(v ?? '').replace(/[<>&"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export async function onRequestPost({ request, env }) {
  let d;
  try {
    d = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  // 스팸 봇 차단 — 사람에게는 보이지 않는 필드가 채워져 있으면 무시
  if (d.company) return json({ ok: true });

  const name  = String(d.name  || '').trim().slice(0, 40);
  const phone = String(d.phone || '').trim().slice(0, 30);
  const type  = String(d.type  || '').trim().slice(0, 60);
  const area  = String(d.area  || '').trim().slice(0, 80);
  const memo  = String(d.memo  || '').trim().slice(0, 2000);

  if (!name || !phone || !type || !area) {
    return json({ ok: false, error: 'missing_field' }, 400);
  }

  const when = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const ip   = request.headers.get('CF-Connecting-IP') || '-';

  const html = `
    <div style="font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;font-size:15px;line-height:1.8;color:#1C2A52">
      <h2 style="margin:0 0 16px;font-size:19px">드림닥터 지점 개설 문의</h2>
      <table cellpadding="8" style="border-collapse:collapse;width:100%;max-width:640px">
        <tr><td style="background:#F4F8FC;width:110px"><b>성함</b></td><td>${esc(name)}</td></tr>
        <tr><td style="background:#F4F8FC"><b>연락처</b></td><td>${esc(phone)}</td></tr>
        <tr><td style="background:#F4F8FC"><b>관심 타입</b></td><td>${esc(type)}</td></tr>
        <tr><td style="background:#F4F8FC"><b>희망 지역</b></td><td>${esc(area)}</td></tr>
        <tr><td style="background:#F4F8FC;vertical-align:top"><b>문의 내용</b></td>
            <td>${esc(memo).replace(/\n/g, '<br>') || '-'}</td></tr>
      </table>
      <p style="margin-top:18px;font-size:12.5px;color:#6B7690">
        접수 ${esc(when)} · 유입 ${esc(d.ref) || '직접 방문'} · IP ${esc(ip)}
      </p>
    </div>`;

  if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) {
    console.log('[문의 접수 · 메일 미발송]', { name, phone, type, area, memo, when });
    return json({ ok: true, mailed: false });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO],
        reply_to: undefined,
        subject: `[지점 개설 문의] ${name} / ${area}`,
        html,
      }),
    });
    if (!r.ok) {
      console.log('메일 발송 실패', r.status, await r.text());
      return json({ ok: true, mailed: false });
    }
  } catch (e) {
    console.log('메일 발송 예외', String(e));
    return json({ ok: true, mailed: false });
  }

  return json({ ok: true, mailed: true });
}

// POST 외 요청 차단
export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return new Response('Method Not Allowed', { status: 405 });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
