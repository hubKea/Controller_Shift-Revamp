"use strict";

const crypto = require('crypto');
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const APP_BASE_URL = (functions.config().app && functions.config().app.base_url) || 'https://thinkers-afrika-shift-reports.web.app';
const APPROVAL_PAGE = (functions.config().app && functions.config().app.approval_url) || `${APP_BASE_URL}/approve.html`;
const MAIL_COLLECTION = (functions.config().mail && functions.config().mail.collection) || 'mail';

function normalizeStatus(status) {
  if (!status) return 'pending';
  return String(status).toLowerCase();
}

function validatePayload(data, { requireComment = false } = {}) {
  if (!data || typeof data !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'Request payload must be an object.');
  }

  const reportId = typeof data.reportId === 'string' ? data.reportId.trim() : '';
  const token = typeof data.token === 'string' ? data.token.trim() : '';

  if (!reportId) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid reportId is required.');
  }
  if (!token) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid token is required.');
  }

  let comment = '';
  if (requireComment) {
    comment = typeof data.comment === 'string' ? data.comment.trim() : '';
    if (!comment) {
      throw new functions.https.HttpsError('invalid-argument', 'A rejection comment is required.');
    }
  }

  return { reportId, token, comment };
}

function gatherTokensFromReviewer(reviewer) {
  const values = new Set();
  if (!reviewer || typeof reviewer !== 'object') return values;

  ['token', 'reviewToken', 'approvalToken', 'linkToken'].forEach((key) => {
    if (typeof reviewer[key] === 'string') {
      values.add(reviewer[key].trim());
    }
  });

  if (Array.isArray(reviewer.tokens)) {
    reviewer.tokens.forEach((value) => {
      if (typeof value === 'string') values.add(value.trim());
    });
  }

  if (Array.isArray(reviewer.links)) {
    reviewer.links.forEach((link) => {
      if (typeof link === 'string') {
        values.add(link.trim());
      } else if (link && typeof link === 'object' && typeof link.token === 'string') {
        values.add(link.token.trim());
      }
    });
  }

  return values;
}

function findReviewerByToken(report, token) {
  if (!token) return null;
  const normalized = token.trim();
  if (!normalized) return null;

  const reviewers = Array.isArray(report.reviewers) ? report.reviewers : [];
  for (let index = 0; index < reviewers.length; index += 1) {
    const reviewer = reviewers[index];
    const tokens = gatherTokensFromReviewer(reviewer);
    if (tokens.has(normalized)) {
      return { index, reviewer };
    }
  }
  return null;
}

function invalidateReviewerTokens(reviewer, timestamp) {
  const updated = reviewer ? { ...reviewer } : {};
  ['token', 'reviewToken', 'approvalToken', 'linkToken'].forEach((key) => {
    if (key in updated) {
      updated[key] = null;
    }
  });

  if (Array.isArray(updated.tokens)) {
    updated.tokens = [];
  }

  if (Array.isArray(updated.links)) {
    updated.links = updated.links
      .map((link) => {
        if (typeof link === 'string') return null;
        if (link && typeof link === 'object') {
          const clone = { ...link };
          if ('token' in clone) clone.token = null;
          return clone;
        }
        return link;
      })
      .filter(Boolean);
  }

  updated.tokenUsed = true;
  updated.tokenInvalidatedAt = timestamp;
  return updated;
}

function removeTokenFromAuxStructures(report, token) {
  const updates = {};
  const normalized = token.trim();

  if (Array.isArray(report.reviewerTokens)) {
    const updated = report.reviewerTokens
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim() === normalized ? null : entry;
        }
        if (entry && typeof entry === 'object') {
          const clone = { ...entry };
          if (clone.token === normalized) clone.token = null;
          if (Array.isArray(clone.tokens)) {
            clone.tokens = clone.tokens.filter((value) => typeof value === 'string' && value.trim() !== normalized);
          }
          if (Array.isArray(clone.links)) {
            clone.links = clone.links
              .map((link) => {
                if (typeof link === 'string') return link.trim() === normalized ? null : link;
                if (link && typeof link === 'object') {
                  const linkClone = { ...link };
                  if ('token' in linkClone && linkClone.token === normalized) {
                    linkClone.token = null;
                  }
                  return linkClone;
                }
                return link;
              })
              .filter(Boolean);
          }
          return clone;
        }
        return entry;
      })
      .filter((entry) => entry !== null);
    updates.reviewerTokens = updated;
  }

  if (report.reviewTokens && typeof report.reviewTokens === 'object' && !Array.isArray(report.reviewTokens)) {
    const updatedMap = {};
    Object.entries(report.reviewTokens).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (value.trim() !== normalized) {
          updatedMap[key] = value;
        }
      } else if (value && typeof value === 'object') {
        const clone = { ...value };
        if (clone.token === normalized) clone.token = null;
        if (Array.isArray(clone.tokens)) {
          clone.tokens = clone.tokens.filter((item) => item !== normalized);
        }
        updatedMap[key] = clone;
      }
    });
    updates.reviewTokens = Object.keys(updatedMap).length ? updatedMap : FieldValue.delete();
  }

  if (report.approvalTokens && typeof report.approvalTokens === 'object' && !Array.isArray(report.approvalTokens)) {
    const updatedMap = {};
    Object.entries(report.approvalTokens).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (value.trim() !== normalized) {
          updatedMap[key] = value;
        }
      } else if (value && typeof value === 'object') {
        const clone = { ...value };
        if (clone.token === normalized) clone.token = null;
        if (Array.isArray(clone.tokens)) {
          clone.tokens = clone.tokens.filter((item) => item !== normalized);
        }
        updatedMap[key] = clone;
      }
    });
    updates.approvalTokens = Object.keys(updatedMap).length ? updatedMap : FieldValue.delete();
  }

  return updates;
}

function clearAllTokens(report) {
  const updates = {};
  if (Array.isArray(report.reviewerTokens) && report.reviewerTokens.length) {
    updates.reviewerTokens = [];
  }
  if (report.reviewTokens) {
    updates.reviewTokens = FieldValue.delete();
  }
  if (report.approvalTokens) {
    updates.approvalTokens = FieldValue.delete();
  }
  return updates;
}

function areAllReviewersApproved(reviewers) {
  const required = (Array.isArray(reviewers) ? reviewers : []).filter((reviewer) => {
    if (!reviewer || typeof reviewer !== 'object') return false;
    if (reviewer.required === false) return false;
    if (reviewer.disabled === true) return false;
    if (reviewer.skip === true) return false;
    return true;
  });

  if (required.length === 0) return false;

  return required.every((reviewer) => {
    const status = normalizeStatus(reviewer.status);
    return status === 'approved' || reviewer.approved === true;
  });
}

function createReviewerToken() {
  return crypto.randomBytes(32).toString('hex');
}

function formatDateForEmail(value) {
  if (!value) return 'this shift';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildReviewEmailHtml(report, reviewerName, link) {
  const safeName = reviewerName || 'Team';
  const shiftDate = formatDateForEmail(report.shiftDate || report.reportDate);
  const siteName = report.siteName || 'the assigned site';
  const controllers = (report.controllers && report.controllers.length) ? report.controllers.join(', ') : 'Shift Controller';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shift Report Review</title>
    <style>
      body { font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 0; }
      a { color: #137fec; }
      .wrapper { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
      .card { background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08); }
      .btn { display: inline-block; padding: 14px 28px; border-radius: 999px; background: #137fec; color: #ffffff; font-weight: 600; text-decoration: none; letter-spacing: 0.02em; }
      .meta { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 14px; color: #475569; }
      .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <h1 style="font-size: 24px; margin-bottom: 16px;">Action Required: Shift Report Review</h1>
        <p style="font-size: 16px; line-height: 1.6;">Hello ${safeName},</p>
        <p style="font-size: 16px; line-height: 1.6;">A new shift report for <strong>${shiftDate}</strong> has been submitted and is ready for your review.</p>
        <p style="font-size: 16px; line-height: 1.6;">Please review the report details and take the appropriate action as soon as possible.</p>
        <table role="presentation" style="width:100%; margin: 24px 0;">
          <tr>
            <td style="padding: 12px 0; color: #475569; font-size: 14px;">
              <strong>Site:</strong> ${siteName}<br />
              <strong>Shift Controllers:</strong> ${controllers}<br />
              <strong>Shift Date:</strong> ${shiftDate}
            </td>
          </tr>
        </table>
        <p style="margin: 32px 0; text-align: center;">
          <a class="btn" href="${link}" target="_blank" rel="noopener">Review Report</a>
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">If the button above does not work, copy and paste the following link into your browser:<br /><span style="word-break: break-all;">${link}</span></p>
        <div class="meta">
          <p>This link is unique to you and will automatically expire once you complete your review.</p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">Thank you for keeping our operations compliant and on schedule.</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-top: 24px;">Best regards,<br />Thinkers Afrika Control Room</p>
      </div>
      <div class="footer">
        This is an automated message. Please do not reply directly to this email.
      </div>
    </div>
  </body>
</html>`;
}

function buildReviewEmailText(report, reviewerName, link) {
  const safeName = reviewerName || 'Team';
  const shiftDate = formatDateForEmail(report.shiftDate || report.reportDate);
  const siteName = report.siteName || 'the assigned site';
  const controllers = (report.controllers && report.controllers.length) ? report.controllers.join(', ') : 'Shift Controller';

  return [
    `Hello ${safeName},`,
    '',
    `A new shift report for ${shiftDate} (${siteName}) has been submitted and is ready for your review.`,
    `Shift Controllers: ${controllers}`,
    '',
    'Please review the report and take action using the secure link below:',
    link,
    '',
    'If you have already completed this review, you can disregard this message.',
    '',
    'Thank you for your prompt attention.',
    'Thinkers Afrika Control Room'
  ].join('\\n');
}

const userIdentityCache = new Map();
const emailIdentityCache = new Map();

async function getUserIdentityByUid(uid) {
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  if (!normalized) return null;

  if (userIdentityCache.has(normalized)) {
    return userIdentityCache.get(normalized);
  }

  let email = null;
  let displayName = null;

  try {
    const snapshot = await db.collection('users').doc(normalized).get();
    if (snapshot.exists) {
      const data = snapshot.data() || {};
      if (typeof data.email === 'string') {
        email = data.email.trim().toLowerCase();
      }
      if (typeof data.displayName === 'string' && data.displayName.trim()) {
        displayName = data.displayName.trim();
      }
    }
  } catch (error) {
    if (functions.logger) {
      functions.logger.warn('Failed to read user profile document', { uid: normalized, error: error.message });
    }
  }

  if (!email || !displayName) {
    try {
      const userRecord = await admin.auth().getUser(normalized);
      if (!email && typeof userRecord.email === 'string') {
        email = userRecord.email.trim().toLowerCase();
      }
      if (!displayName) {
        if (typeof userRecord.displayName === 'string' && userRecord.displayName.trim()) {
          displayName = userRecord.displayName.trim();
        } else if (typeof userRecord.email === 'string') {
          displayName = userRecord.email.trim();
        }
      }
    } catch (error) {
      if (functions.logger) {
        functions.logger.warn('Auth record lookup failed while resolving user identity', { uid: normalized, error: error.message });
      }
    }
  }

  if (!displayName) {
    displayName = email || normalized;
  }

  const identity = {
    uid: normalized,
    email: email || null,
    displayName
  };

  userIdentityCache.set(normalized, identity);
  if (identity.email && !emailIdentityCache.has(identity.email)) {
    emailIdentityCache.set(identity.email, identity);
  }

  return identity;
}

async function getUserIdentityByEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized) return null;

  if (emailIdentityCache.has(normalized)) {
    return emailIdentityCache.get(normalized);
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(normalized);
    const identity = await getUserIdentityByUid(userRecord.uid);
    if (identity) {
      emailIdentityCache.set(normalized, identity);
      return identity;
    }

    const fallback = {
      uid: userRecord.uid,
      email: normalized,
      displayName: userRecord.displayName || normalized
    };
    userIdentityCache.set(userRecord.uid, fallback);
    emailIdentityCache.set(normalized, fallback);
    return fallback;
  } catch (error) {
    if (functions.logger) {
      functions.logger.warn('Auth lookup by email failed while resolving identity', { email: normalized, error: error.message });
    }
  }

  try {
    const snapshot = await db.collection('users').where('email', '==', normalized).limit(1).get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data() || {};
      const identity = {
        uid: doc.id,
        email: normalized,
        displayName: (typeof data.displayName === 'string' && data.displayName.trim()) ? data.displayName.trim() : (data.email || normalized)
      };
      userIdentityCache.set(identity.uid, identity);
      emailIdentityCache.set(normalized, identity);
      return identity;
    }
  } catch (error) {
    if (functions.logger) {
      functions.logger.warn('Firestore lookup by email failed while resolving identity', { email: normalized, error: error.message });
    }
  }

  emailIdentityCache.set(normalized, null);
  return null;
}

async function createInboxNotification(recipientUid, notification) {
  const targetUid = typeof recipientUid === 'string' ? recipientUid.trim() : '';
  if (!targetUid) return null;

  const inboxRef = db.collection('inboxes').doc(targetUid);
  const itemRef = inboxRef.collection('items').doc();
  const unread = notification.unread !== false;

  const payload = {
    ...notification,
    unread,
    createdAt: FieldValue.serverTimestamp()
  };

  return db.runTransaction(async (tx) => {
    tx.set(itemRef, payload);
    const parentUpdateTimestamp = FieldValue.serverTimestamp();
    const parentUpdateIso = Timestamp.now().toDate().toISOString();
    const parentUpdate = {
      updatedAt: parentUpdateTimestamp,
      updatedAtServer: parentUpdateTimestamp,
      updatedAtClientIso: parentUpdateIso
    };
    if (unread) {
      parentUpdate.unreadCount = FieldValue.increment(1);
    }
    tx.set(inboxRef, parentUpdate, { merge: true });
  });
}

function buildShiftSummary(shiftDate, siteName) {
  const trimmedSite = typeof siteName === 'string' ? siteName.trim() : '';
  let dateLabel = '';

  if (shiftDate) {
    const formatted = formatDateForEmail(shiftDate);
    if (formatted && formatted !== 'this shift') {
      dateLabel = formatted;
    }
  }

  if (trimmedSite && dateLabel) {
    return `${trimmedSite} on ${dateLabel}`;
  }

  if (trimmedSite) return trimmedSite;
  if (dateLabel) return dateLabel;

  return 'this shift';
}

async function resolveReviewers(after) {
  if (!after) return [];

  const reviewers = Array.isArray(after.reviewers) ? after.reviewers : [];
  const explicit = reviewers
    .map((reviewer) => {
      if (!reviewer || typeof reviewer !== 'object') return null;
      const uid = typeof reviewer.uid === 'string' ? reviewer.uid.trim() : '';
      return uid || null;
    })
    .filter(Boolean);

  if (explicit.length) {
    return Array.from(new Set(explicit));
  }

  const submitter =
    (typeof after.submittedBy === 'string' && after.submittedBy.trim()) ||
    (after.controller1 && typeof after.controller1 === 'object' && typeof after.controller1.uid === 'string'
      ? after.controller1.uid.trim()
      : null);

  const snapshot = await db.collection('users').where('permissions.canApprove', '==', true).get();
  const fallback = snapshot.docs
    .map((doc) => doc.id)
    .filter((id) => typeof id === 'string' && id && (!submitter || id !== submitter));

  return Array.from(new Set(fallback));
}

async function publishNotification(uid, payload) {
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  if (!normalized) return null;
  return createInboxNotification(normalized, payload);
}

function collectControllerUids(after) {
  if (!after) return [];

  const candidates = [];
  if (after.controller1) candidates.push(after.controller1);
  if (after.controller2) candidates.push(after.controller2);
  if (typeof after.controller1Uid === 'string') candidates.push({ uid: after.controller1Uid });
  if (typeof after.controller2Uid === 'string') candidates.push({ uid: after.controller2Uid });

  const uids = new Set();
  candidates.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    const uid =
      (typeof candidate.uid === 'string' && candidate.uid.trim()) ||
      (typeof candidate.id === 'string' && candidate.id.trim()) ||
      null;
    if (uid) {
      uids.add(uid);
    }
  });

  return Array.from(uids);
}

exports.users = {
  listForAssign: functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }

    const rawRoles = Array.isArray(data?.roles) ? data.roles : [];
    const normalizedRoles = Array.from(
      new Set(
        rawRoles
          .map((role) => (typeof role === 'string' ? role.trim() : ''))
          .filter(Boolean)
      )
    );
    const roles = normalizedRoles.length ? normalizedRoles : ['controller', 'manager'];

    const MAX_IN_CLAUSE = 10;
    const MAX_RESULTS = 200;
    const roleChunks = [];
    for (let index = 0; index < roles.length; index += MAX_IN_CLAUSE) {
      roleChunks.push(roles.slice(index, index + MAX_IN_CLAUSE));
    }

    const firestore = admin.firestore();
    const snapshots = await Promise.all(
      roleChunks.map((chunk) =>
        firestore
          .collection('users')
          .where('isActive', '==', true)
          .where('role', 'in', chunk)
          .limit(MAX_RESULTS)
          .get()
      )
    );

    const items = [];
    const seen = new Set();

    outer: for (const snap of snapshots) {
      for (const docSnap of snap.docs) {
        if (seen.has(docSnap.id)) {
          continue;
        }

        const record = docSnap.data() || {};
        const displayName =
          (typeof record.displayName === 'string' && record.displayName.trim()) ||
          (typeof record.name === 'string' && record.name.trim()) ||
          (typeof record.email === 'string' && record.email.trim()) ||
          'User';
        const email = typeof record.email === 'string' ? record.email.trim() : '';
        const role = typeof record.role === 'string' ? record.role : 'controller';

        items.push({
          uid: docSnap.id,
          displayName,
          email,
          role
        });
        seen.add(docSnap.id);

        if (items.length >= MAX_RESULTS) {
          break outer;
        }
      }
    }

    return { items };
  })
};

exports.sendReviewRequestEmail = functions.firestore
  .document('shiftReports/{reportId}')
  .onWrite(async (change, context) => {
    const afterSnap = change.after;
    if (!afterSnap.exists) {
      return null;
    }

    const afterData = afterSnap.data();
    const afterStatus = normalizeStatus(afterData.status);
    const beforeStatus = normalizeStatus(change.before.exists ? change.before.data().status : null);

    if (afterStatus !== 'under_review' || beforeStatus === 'under_review') {
      return null;
    }

    const reportRef = afterSnap.ref;
    const nowTs = Timestamp.now();
    const pendingEmails = [];

    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(reportRef);
      if (!snapshot.exists) {
        return;
      }

      const current = snapshot.data();
      if (normalizeStatus(current.status) !== 'under_review') {
        return;
      }

      const reviewers = Array.isArray(current.reviewers) ? current.reviewers : [];
      if (reviewers.length === 0) {
        return;
      }

      const updatedReviewers = reviewers.map((reviewer) => (reviewer ? { ...reviewer } : reviewer));

      updatedReviewers.forEach((reviewer, index) => {
        if (!reviewer || typeof reviewer !== 'object') return;

        const rawEmail = reviewer.email || reviewer.reviewerEmail;
        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        if (!email) return;

        const token = createReviewerToken();
        const name = reviewer.name || reviewer.reviewerName || email;
        const link = `${APPROVAL_PAGE}?reportId=${encodeURIComponent(context.params.reportId)}&token=${encodeURIComponent(token)}`;

        const normalizedReviewer = {
          ...reviewer,
          email,
          name,
          status: 'pending',
          approved: false,
          rejected: false,
          tokenUsed: false,
          tokenIssuedAt: nowTs,
          token,
          reviewToken: token,
          approvalToken: token,
          approvedAt: null,
          rejectedAt: null,
          rejectionComment: null
        };

        updatedReviewers[index] = normalizedReviewer;

        pendingEmails.push({
          email,
          name,
          link,
          report: {
            id: context.params.reportId,
            shiftDate: current.reportDate || current.shiftDate,
            shiftType: current.shiftType,
            siteName: current.siteName || current.startingDestination,
            controllers: [current.controller1, current.controller2].filter(Boolean)
          }
        });
      });

      if (pendingEmails.length === 0) {
        return;
      }

      const updateSentinel = FieldValue.serverTimestamp();
      const updateIso = nowTs.toDate().toISOString();
      tx.update(reportRef, {
        reviewers: updatedReviewers,
        reviewRequestedAt: nowTs,
        updatedAt: updateSentinel,
        updatedAtServer: updateSentinel,
        updatedAtClientIso: updateIso
      });
    });

    if (!pendingEmails.length) {
      return null;
    }

    await Promise.all(
      pendingEmails.map((entry) => {
        const subject = `Action Required: Please Review the Shift Report for ${formatDateForEmail(entry.report.shiftDate)}`;
        const html = buildReviewEmailHtml(entry.report, entry.name, entry.link);
        const text = buildReviewEmailText(entry.report, entry.name, entry.link);

        return db.collection(MAIL_COLLECTION).add({
          to: [entry.email],
          message: {
            subject,
            html,
            text
          }
        });
      })
    );

    return null;
  });

exports.onReportUnderReview = functions.firestore
  .document('shiftReports/{reportId}')
  .onUpdate(async (change, context) => {
    if (!change.before.exists || !change.after.exists) {
      return null;
    }

    const before = change.before.data();
    const after = change.after.data();
    const beforeStatus = normalizeStatus(before.status);
    const afterStatus = normalizeStatus(after.status);

    if (beforeStatus === 'under_review' || afterStatus !== 'under_review') {
      return null;
    }

    const targets = await resolveReviewers(after);
    if (!targets.length) {
      return null;
    }

    let actorId =
      (typeof after.submittedBy === 'string' && after.submittedBy.trim()) ||
      (after.controller1 && typeof after.controller1 === 'object' && typeof after.controller1.uid === 'string'
        ? after.controller1.uid.trim()
        : '');
    actorId = actorId || 'system';

    let actorName = 'Controller';
    if (after.controller1 && typeof after.controller1 === 'object') {
      if (typeof after.controller1.name === 'string' && after.controller1.name.trim()) {
        actorName = after.controller1.name.trim();
      } else if (typeof after.controller1.displayName === 'string' && after.controller1.displayName.trim()) {
        actorName = after.controller1.displayName.trim();
      }
    } else if (typeof after.controller1 === 'string' && after.controller1.trim()) {
      actorName = after.controller1.trim();
    }

    if (actorId !== 'system') {
      const actorIdentity = await getUserIdentityByUid(actorId);
      if (actorIdentity) {
        actorId = actorIdentity.uid;
        actorName = actorIdentity.displayName || actorIdentity.email || actorName;
      }
    }

    const payload = {
      type: 'review_request',
      reportId: context.params.reportId,
      actorId,
      actorName,
      status: 'under_review',
      title: 'Review requested',
      body: 'A shift report requires your approval.',
      unread: true,
      reportDate: after.reportDate || after.shiftDate || null,
      siteName: after.siteName || after.startingDestination || null
    };

    await Promise.all(
      targets.map(async (uid) => {
        const identity = await getUserIdentityByUid(uid);
        if (!identity) {
          return null;
        }
        return publishNotification(identity.uid, payload);
      })
    );

    return null;
  });

exports.onReportDecision = functions.firestore
  .document('shiftReports/{reportId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const beforeStatus = normalizeStatus(beforeData.status);
    const afterStatus = normalizeStatus(afterData.status);

    if (beforeStatus === afterStatus) {
      return null;
    }

    if (!['approved', 'rejected'].includes(afterStatus)) {
      return null;
    }

    const reportId = context.params.reportId;
    const shiftDate = afterData.reportDate || afterData.shiftDate;
    const siteName = afterData.siteName || afterData.startingDestination;

    let actorUid = typeof afterData.approvedBy === 'string' ? afterData.approvedBy.trim() : '';
    let actorName = null;
    let actorEmail = null;

    const approvals = Array.isArray(afterData.approvals) ? afterData.approvals : [];
    if (!actorUid && approvals.length) {
      const latest = approvals[approvals.length - 1];
      if (latest && typeof latest === 'object') {
        if (typeof latest.approverId === 'string') {
          actorUid = latest.approverId.trim();
        }
        if (typeof latest.approverName === 'string' && latest.approverName.trim()) {
          actorName = latest.approverName.trim();
        }
      }
    }

    if (!actorUid) {
      const afterReviewers = Array.isArray(afterData.reviewers) ? afterData.reviewers : [];
      const beforeReviewers = Array.isArray(beforeData.reviewers) ? beforeData.reviewers : [];
      for (let index = 0; index < afterReviewers.length; index += 1) {
        const afterReviewer = afterReviewers[index];
        if (!afterReviewer || typeof afterReviewer !== 'object') continue;
        const afterReviewerStatus = normalizeStatus(afterReviewer.status);
        if (afterReviewerStatus !== afterStatus) continue;
        const priorReviewer = beforeReviewers[index] || {};
        const priorStatus = normalizeStatus(priorReviewer.status);
        if (priorStatus === afterStatus) continue;

        if (typeof afterReviewer.email === 'string') {
          actorEmail = afterReviewer.email.trim().toLowerCase();
        }
        if (!actorName && typeof afterReviewer.name === 'string' && afterReviewer.name.trim()) {
          actorName = afterReviewer.name.trim();
        }
        break;
      }
    }

    let actorIdentity = null;
    let actorId = 'system';

    if (actorUid) {
      actorIdentity = await getUserIdentityByUid(actorUid);
      actorId = (actorIdentity && actorIdentity.uid) || actorUid;
      if (!actorName) {
        actorName =
          (actorIdentity && actorIdentity.displayName) ||
          (actorIdentity && actorIdentity.email) ||
          actorUid;
      }
    } else if (actorEmail) {
      actorIdentity = await getUserIdentityByEmail(actorEmail);
      if (actorIdentity) {
        actorId = actorIdentity.uid;
        if (!actorName) {
          actorName = actorIdentity.displayName || actorIdentity.email || actorEmail;
        }
      } else {
        actorId = actorEmail;
        actorName = actorName || actorEmail;
      }
    }

    if (!actorName) {
      actorName = 'Review Team';
    }

    const controllerRecipients = collectControllerUids(afterData);
    const recipientUids = new Set(controllerRecipients);

    if (recipientUids.size === 0) {
      if (typeof afterData.submittedBy === 'string' && afterData.submittedBy.trim()) {
        recipientUids.add(afterData.submittedBy.trim());
      } else if (typeof afterData.createdBy === 'string' && afterData.createdBy.trim()) {
        recipientUids.add(afterData.createdBy.trim());
      } else {
        return null;
      }
    }

    const shiftSummary = buildShiftSummary(shiftDate, siteName);
    const verb = afterStatus === 'approved' ? 'approved' : 'rejected';
    const title = afterStatus === 'approved' ? 'Report approved' : 'Report rejected';
    const body = `${actorName} ${verb} your report for ${shiftSummary}.`;

    await Promise.all(
      Array.from(recipientUids).map(async (uid) => {
        const identity = await getUserIdentityByUid(uid);
        if (!identity) {
          return null;
        }
        return publishNotification(identity.uid, {
          type: 'review_decision',
          reportId,
          actorId,
          actorName,
          status: afterStatus,
          title,
          body,
          unread: true,
          reportDate: shiftDate || null,
          siteName: siteName || null
        });
      })
    );

    return null;
  });

exports.reviewerApproveReport = functions.https.onCall(async (data) => {
  const { reportId, token } = validatePayload(data);
  const docRef = db.collection('shiftReports').doc(reportId);
  const nowTs = Timestamp.now();

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    if (!snapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found.');
    }

    const report = snapshot.data();
    const currentStatus = normalizeStatus(report.status);
    if (['approved', 'rejected'].includes(currentStatus)) {
      throw new functions.https.HttpsError('failed-precondition', `This report has already been ${currentStatus}.`);
    }

    const match = findReviewerByToken(report, token);
    if (!match) {
      throw new functions.https.HttpsError('permission-denied', 'The provided approval token is invalid or has expired.');
    }

    const reviewerSnapshot = match.reviewer || {};
    if (reviewerSnapshot.tokenUsed || ['approved', 'rejected'].includes(normalizeStatus(reviewerSnapshot.status))) {
      throw new functions.https.HttpsError('failed-precondition', 'This approval token has already been used.');
    }

    const reviewers = Array.isArray(report.reviewers)
      ? report.reviewers.map((reviewer) => (reviewer ? { ...reviewer } : reviewer))
      : [];
    if (!reviewers[match.index]) {
      throw new functions.https.HttpsError('failed-precondition', 'Reviewer record could not be located.');
    }

    const reviewerUpdate = invalidateReviewerTokens({ ...reviewers[match.index] }, nowTs);
    reviewerUpdate.status = 'approved';
    reviewerUpdate.approved = true;
    reviewerUpdate.approvedAt = nowTs;
    reviewerUpdate.rejected = false;
    reviewerUpdate.rejectedAt = null;
    reviewerUpdate.rejectionComment = null;

    reviewers[match.index] = reviewerUpdate;

    const updateSentinel = FieldValue.serverTimestamp();
    const updateIso = Timestamp.now().toDate().toISOString();
    const updates = {
      reviewers,
      updatedAt: updateSentinel,
      updatedAtServer: updateSentinel,
      updatedAtClientIso: updateIso
    };

    Object.assign(updates, removeTokenFromAuxStructures(report, token));

    if (areAllReviewersApproved(reviewers)) {
      const approvalSentinel = FieldValue.serverTimestamp();
      updates.status = 'approved';
      updates.approvedAt = approvalSentinel;
      updates.approvedAtServer = approvalSentinel;
      updates.approvedAtClientIso = updateIso;
    } else if (currentStatus === 'submitted') {
      updates.status = 'under_review';
    }

    tx.update(docRef, updates);
    return { message: 'Report approved successfully.' };
  });

  return result;
});

exports.reviewerRejectReport = functions.https.onCall(async (data) => {
  const { reportId, token, comment } = validatePayload(data, { requireComment: true });
  const docRef = db.collection('shiftReports').doc(reportId);
  const nowTs = Timestamp.now();

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    if (!snapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found.');
    }

    const report = snapshot.data();
    const currentStatus = normalizeStatus(report.status);
    if (currentStatus === 'approved') {
      throw new functions.https.HttpsError('failed-precondition', 'Approved reports can no longer be rejected.');
    }
    if (currentStatus === 'rejected') {
      throw new functions.https.HttpsError('failed-precondition', 'This report has already been rejected.');
    }

    const match = findReviewerByToken(report, token);
    if (!match) {
      throw new functions.https.HttpsError('permission-denied', 'The provided rejection token is invalid or has expired.');
    }

    const reviewerSnapshot = match.reviewer || {};
    if (reviewerSnapshot.tokenUsed) {
      throw new functions.https.HttpsError('failed-precondition', 'This rejection token has already been used.');
    }

    const reviewers = Array.isArray(report.reviewers)
      ? report.reviewers.map((reviewer) => (reviewer ? { ...reviewer } : reviewer))
      : [];
    if (!reviewers[match.index]) {
      throw new functions.https.HttpsError('failed-precondition', 'Reviewer record could not be located.');
    }

    const updatedReviewers = reviewers.map((reviewer, index) => {
      if (!reviewer) return reviewer;
      const clone = invalidateReviewerTokens({ ...reviewer }, nowTs);
      clone.approved = false;

      if (index === match.index) {
        clone.status = 'rejected';
        clone.rejected = true;
        clone.rejectedAt = nowTs;
        clone.rejectionComment = comment;
        clone.approvedAt = null;
      } else {
        const previousStatus = normalizeStatus(clone.status);
        if (previousStatus !== 'approved') {
          clone.status = 'pending';
        }
        clone.approvedAt = null;
        if (!clone.rejectionComment) {
          clone.rejectionComment = null;
        }
      }
      return clone;
    });

    const updateIso = Timestamp.now().toDate().toISOString();
    const rejectionSentinel = FieldValue.serverTimestamp();
    const updateSentinel = FieldValue.serverTimestamp();
    const updates = {
      reviewers: updatedReviewers,
      status: 'rejected',
      rejectionReason: comment,
      rejectedAt: rejectionSentinel,
      rejectedAtServer: rejectionSentinel,
      rejectedAtClientIso: updateIso,
      updatedAt: updateSentinel,
      updatedAtServer: updateSentinel,
      updatedAtClientIso: updateIso
    };

    Object.assign(updates, clearAllTokens(report));

    tx.update(docRef, updates);
    return { message: 'Report rejected successfully.' };
  });

  return result;
});
