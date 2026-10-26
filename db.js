/**
 * db.js — MitShop data access layer
 * Storage: JSON flat-file for local development.
 * All function signatures are storage-agnostic so the implementation can be
 * swapped for Postgres (pg) in production without touching route handlers.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

// ─── Seed data ───────────────────────────────────────────────────────────────
const SEED = {
  campuses: [
    {
      id:         1,
      name:       'Madhav Institute of Technology & Science, Gwalior',
      status:     'active',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z'
    },
    {
      id:         2,
      name:       'Massachusetts Institute of Technology (Example/Dev)',
      status:     'active',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z'
    },
    {
      id:         3,
      name:       'University of Cambridge (Example/Dev)',
      status:     'active',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z'
    },
    {
      id:         4,
      name:       'Archived College (Example/Dev)',
      status:     'disabled',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z'
    }
  ],
  campus_domains: [
    {
      id:               1,
      campus_id:        1,
      domain:           'mitsgwl.ac.in',
      match_subdomains: true,
      is_active:        true,
      created_at:       '2026-10-01T00:00:00.000Z'
    },
    {
      id:               2,
      campus_id:        2,
      domain:           'mit.edu',
      match_subdomains: true,
      is_active:        true,
      created_at:       '2026-10-01T00:00:00.000Z'
    },
    {
      id:               3,
      campus_id:        3,
      domain:           'cam.ac.uk',
      match_subdomains: false,
      is_active:        true,
      created_at:       '2026-10-01T00:00:00.000Z'
    },
    {
      id:               4,
      campus_id:        4,
      domain:           'archived.edu',
      match_subdomains: false,
      is_active:        true,
      created_at:       '2026-10-01T00:00:00.000Z'
    }
  ],
  users: [
    {
      user_id:           1,
      campus_id:         1,
      google_sub:        null,
      name:              'Karan',
      email:             'karan@campus.edu',
      picture:           '',
      hostel_room:       'H2 · Room 316',
      phone:             null,
      status:            'active',
      terms_version:     'v1.0',
      terms_accepted_at: '2026-10-01T10:00:00.000Z',
      is_admin:          false,
      is_blocked:        false,
      created_at:        '2026-10-01T10:00:00.000Z',
      last_login:        null
    },
    {
      user_id:           2,
      campus_id:         1,
      google_sub:        null,
      name:              'Neha',
      email:             'neha@campus.edu',
      picture:           '',
      hostel_room:       'H7 · Room 505',
      phone:             null,
      status:            'active',
      terms_version:     'v1.0',
      terms_accepted_at: '2026-10-02T11:00:00.000Z',
      is_admin:          false,
      is_blocked:        false,
      created_at:        '2026-10-02T11:00:00.000Z',
      last_login:        null
    },
    {
      user_id:           3,
      campus_id:         1,
      google_sub:        null,
      name:              'Rahul',
      email:             'rahul@campus.edu',
      picture:           '',
      hostel_room:       'H4 · Room 210',
      phone:             null,
      status:            'active',
      terms_version:     'v1.0',
      terms_accepted_at: '2026-10-03T12:00:00.000Z',
      is_admin:          false,
      is_blocked:        false,
      created_at:        '2026-10-03T12:00:00.000Z',
      last_login:        null
    }
  ],
  user_emails: [
    { id: 1, user_id: 1, normalized_email: 'karan@campus.edu', verified_at: '2026-10-01T10:00:00.000Z', is_primary: true },
    { id: 2, user_id: 2, normalized_email: 'neha@campus.edu',  verified_at: '2026-10-02T11:00:00.000Z', is_primary: true },
    { id: 3, user_id: 3, normalized_email: 'rahul@campus.edu', verified_at: '2026-10-03T12:00:00.000Z', is_primary: true }
  ],
  items: [
    {
      item_id:    1,
      seller_id:  1,
      campus_id:  1,
      title:      'Data Structures in C',
      category:   'Books',
      price:      180,
      condition:  'Good',
      hostel_room:'H2 · Room 316',
      details:    '3rd Edition by Reema Thareja. Useful for 2nd year CS. Clean pages with highlighted key topics.',
      status:     'Available',
      image_type: 'book',
      image_url:  '/images/data_structures_c.jpg',
      created_at: '2026-10-05T09:00:00.000Z'
    },
    {
      item_id:    2,
      seller_id:  1,
      campus_id:  1,
      title:      'Wired earphones',
      category:   'Electronics',
      price:      120,
      condition:  'Like new',
      hostel_room:'H2 · Room 316',
      details:    'Boat Bassheads 3.5mm jack with microphone. Crisp sound, only used twice.',
      status:     'Available',
      image_type: 'calculator',
      image_url:  '/images/wired_earphones.jpg',
      created_at: '2026-10-06T10:30:00.000Z'
    },
    {
      item_id:    3,
      seller_id:  2,
      campus_id:  1,
      title:      'Bucket and mug set',
      category:   'Hostel Essentials',
      price:      60,
      condition:  'Good',
      hostel_room:'H7 · Room 505',
      details:    'Heavy-duty 20L blue bucket and matching 1L mug. Clean and ready for hostel use.',
      status:     'Available',
      image_type: 'bucket',
      image_url:  '/images/bucket_mug.jpg',
      created_at: '2026-10-07T14:15:00.000Z'
    },
    {
      item_id:    4,
      seller_id:  3,
      campus_id:  1,
      title:      'Engineering Drafter kit',
      category:   'Stationery',
      price:      150,
      condition:  'Good',
      hostel_room:'H4 · Room 210',
      details:    'Omega mini drafter with clamp, scale, and drawing sheet protective carrying tube.',
      status:     'Available',
      image_type: 'drafter',
      image_url:  '/images/engineering_drafter.jpg',
      created_at: '2026-10-08T08:45:00.000Z'
    },
    {
      item_id:    5,
      seller_id:  3,
      campus_id:  1,
      title:      'Electric Kettle (1.2L)',
      category:   'Hostel Essentials',
      price:      320,
      condition:  'Like new',
      hostel_room:'H4 · Room 210',
      details:    'Stainless steel instant heating kettle with auto cut-off. Great for midnight coffee and noodles.',
      status:     'Available',
      image_type: 'kettle',
      image_url:  '/images/electric_kettle.jpg',
      created_at: '2026-10-08T15:20:00.000Z'
    },
    {
      item_id:    6,
      seller_id:  2,
      campus_id:  1,
      title:      'White Lab Coat (M)',
      category:   'Stationery',
      price:      130,
      condition:  'Good',
      hostel_room:'H7 · Room 505',
      details:    'Medium size pure cotton lab coat. Cleaned and pressed, required for chemistry/biology labs.',
      status:     'Available',
      image_type: 'labcoat',
      image_url:  '/images/labcoat.png',
      created_at: '2026-10-09T08:10:00.000Z'
    }
  ],
  orders: [
    {
      order_id:        1,
      buyer_id:        2,
      seller_id:       1,
      item_id:         1,
      item_title:      'Data Structures in C',
      quantity:        1,
      total:           180,
      pickup_location: 'Hostel Gate 2 (Boys)',
      hostel_room:     'H7 · Room 505',
      payment_method:  'Cash',
      status:          'Pending',
      created_at:      '2026-10-09T10:00:00.000Z'
    }
  ],
  messages: [
    {
      message_id:   1,
      item_id:      1,
      sender_id:    2,
      receiver_id:  1,
      message_text: 'Hi, is the Data Structures in C still available?',
      timestamp:    '2026-10-09T09:15:00.000Z',
      read_at:      null
    },
    {
      message_id:   2,
      item_id:      1,
      sender_id:    1,
      receiver_id:  2,
      message_text: 'Yes, it is still available. Can we meet at the hostel gate?',
      timestamp:    '2026-10-09T09:16:30.000Z',
      read_at:      null
    },
    {
      message_id:   3,
      item_id:      1,
      sender_id:    2,
      receiver_id:  1,
      message_text: 'What is the edition of this book',
      timestamp:    '2026-10-09T09:18:00.000Z',
      read_at:      null
    },
    {
      message_id:   4,
      item_id:      1,
      sender_id:    1,
      receiver_id:  2,
      message_text: 'It is the 3rd edition by Reema Thareja! No missing pages, very clean.',
      timestamp:    '2026-10-09T09:19:15.000Z',
      read_at:      null
    }
  ],
  wishlist: [],
  login_challenges: [],
  sessions: [],
  auth_events: [],
  campus_requests: [],
  email_change_transactions: [],
  counters: {
    user_id:           4,
    item_id:           7,
    order_id:          2,
    message_id:        5,
    campus_id:         5,
    domain_id:         5,
    user_email_id:     4,
    auth_event_id:     1,
    campus_request_id: 1
  }
};

// ─── I/O helpers ─────────────────────────────────────────────────────────────
let lastValidState = null;

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    writeDB(SEED);
    lastValidState = JSON.parse(JSON.stringify(SEED));
    return JSON.parse(JSON.stringify(SEED));
  }
  try {
    const raw    = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.users || !parsed.items) {
      if (lastValidState) {
        return JSON.parse(JSON.stringify(lastValidState));
      }
      writeDB(SEED);
      lastValidState = JSON.parse(JSON.stringify(SEED));
      return JSON.parse(JSON.stringify(SEED));
    }

    // Ensure new collections exist
    if (!parsed.campuses || parsed.campuses.length === 0) {
      parsed.campuses = JSON.parse(JSON.stringify(SEED.campuses));
    }
    if (!parsed.campus_domains || parsed.campus_domains.length === 0) {
      parsed.campus_domains = JSON.parse(JSON.stringify(SEED.campus_domains));
    }
    if (!parsed.user_emails) parsed.user_emails = [];
    if (!parsed.login_challenges) parsed.login_challenges = [];
    if (!parsed.sessions) parsed.sessions = [];
    if (!parsed.auth_events) parsed.auth_events = [];
    if (!parsed.campus_requests) parsed.campus_requests = [];
    if (!parsed.email_change_transactions) parsed.email_change_transactions = [];
    if (!parsed.wishlist) parsed.wishlist = [];
    if (!parsed.messages) parsed.messages = [];

    // Counters backfill
    parsed.counters = {
      user_id:           4,
      item_id:           7,
      order_id:          2,
      message_id:        5,
      campus_id:         5,
      domain_id:         5,
      user_email_id:     1,
      auth_event_id:     1,
      campus_request_id: 1,
      ...(parsed.counters || {})
    };

    // Back-fill new fields on existing user records
    parsed.users = parsed.users.map(u => {
      const isBlocked = Boolean(u.is_blocked || u.status === 'suspended');
      return {
        campus_id:         u.campus_id || 1,
        google_sub:        u.google_sub || null,
        picture:           u.picture || '',
        phone:             u.phone || null,
        status:            u.status || (isBlocked ? 'suspended' : 'active'),
        terms_version:     u.terms_version !== undefined ? u.terms_version : 'v1.0',
        terms_accepted_at: u.terms_accepted_at !== undefined ? u.terms_accepted_at : (u.created_at || new Date().toISOString()),
        is_admin:          Boolean(u.is_admin),
        is_blocked:        isBlocked,
        last_login:        u.last_login || null,
        ...u
      };
    });

    // Ensure user_emails contains entries for existing users
    parsed.users.forEach(u => {
      if (u.email && !parsed.user_emails.some(ue => ue.normalized_email.toLowerCase() === u.email.toLowerCase())) {
        parsed.user_emails.push({
          id: parsed.counters.user_email_id++,
          user_id: u.user_id,
          normalized_email: u.email.toLowerCase(),
          verified_at: u.created_at || new Date().toISOString(),
          is_primary: true
        });
      }
    });

    // Ensure items have campus_id
    parsed.items = parsed.items.map(i => {
      const seller = parsed.users.find(u => u.user_id === i.seller_id);
      return {
        campus_id: i.campus_id || (seller ? seller.campus_id : 1),
        ...i
      };
    });

    parsed.messages = parsed.messages.map(m => ({ read_at: null, ...m }));
    lastValidState = parsed;
    return parsed;
  } catch (err) {
    console.error('CRITICAL: DB read failure. Preserving backup:', err.message);
    const corruptBackup = `${DB_PATH}.corrupt.${Date.now()}`;
    try {
      if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, corruptBackup);
    } catch (_) {}

    if (lastValidState) {
      console.warn('Recovered safely from in-memory last-valid database state.');
      return JSON.parse(JSON.stringify(lastValidState));
    }
    writeDB(SEED);
    lastValidState = JSON.parse(JSON.stringify(SEED));
    return JSON.parse(JSON.stringify(SEED));
  }
}

function writeDB(data) {
  const dir = path.dirname(DB_PATH);
  const tempPath = path.join(dir, `.data.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`);
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
    lastValidState = JSON.parse(JSON.stringify(data));
  } catch (err) {
    console.error('DB write error:', err.message);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
  }
}

// ─── CAMPUSES & DOMAINS ───────────────────────────────────────────────────────

function getCampuses() {
  return readDB().campuses;
}

function getActiveCampusesWithDomains() {
  const store = readDB();
  const activeCampuses = store.campuses.filter(c => c.status === 'active');
  return activeCampuses.map(campus => {
    const domains = store.campus_domains
      .filter(cd => cd.campus_id === campus.id && cd.is_active)
      .map(cd => cd.domain);
    return {
      id:      campus.id,
      name:    campus.name,
      domains
    };
  });
}

function getCampusById(id) {
  return readDB().campuses.find(c => c.id === Number(id)) || null;
}

function getCampusDomains() {
  return readDB().campus_domains;
}

function getDomainsForCampus(campusId) {
  return readDB().campus_domains.filter(cd => cd.campus_id === Number(campusId));
}

function createCampus({ name, status = 'active' }) {
  const store = readDB();
  const now = new Date().toISOString();
  const newCampus = {
    id:         store.counters.campus_id++,
    name:       String(name).trim(),
    status:     status === 'disabled' ? 'disabled' : 'active',
    created_at: now,
    updated_at: now
  };
  store.campuses.push(newCampus);
  writeDB(store);
  return newCampus;
}

function updateCampusStatus(id, status) {
  const store = readDB();
  const campus = store.campuses.find(c => c.id === Number(id));
  if (!campus) return null;
  campus.status = status;
  campus.updated_at = new Date().toISOString();
  writeDB(store);
  return campus;
}

function createCampusDomain({ campus_id, domain, match_subdomains = false, is_active = true }) {
  const store = readDB();
  const newDomain = {
    id:               store.counters.domain_id++,
    campus_id:        Number(campus_id),
    domain:           String(domain).toLowerCase().trim(),
    match_subdomains: Boolean(match_subdomains),
    is_active:        Boolean(is_active),
    created_at:       new Date().toISOString()
  };
  store.campus_domains.push(newDomain);
  writeDB(store);
  return newDomain;
}

function updateCampusDomainStatus(id, is_active) {
  const store = readDB();
  const cd = store.campus_domains.find(d => d.id === Number(id));
  if (!cd) return null;
  cd.is_active = Boolean(is_active);
  writeDB(store);
  return cd;
}

// ─── USERS ───────────────────────────────────────────────────────────────────

function getUserById(id) {
  return readDB().users.find(u => u.user_id === Number(id)) || null;
}

function getUserByEmail(email) {
  if (!email) return null;
  const target = String(email).toLowerCase().trim();
  const store = readDB();

  const user = store.users.find(u => u.email.toLowerCase() === target);
  if (user) return user;

  const emailRow = store.user_emails.find(ue => ue.normalized_email.toLowerCase() === target);
  if (emailRow) {
    return store.users.find(u => u.user_id === emailRow.user_id) || null;
  }

  return null;
}

function getUsers() {
  return readDB().users;
}

function createUserWithCampus({ campus_id, email, name, terms_version = null, terms_accepted_at = null }) {
  const store = readDB();
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date().toISOString();

  const newUser = {
    user_id:           store.counters.user_id++,
    campus_id:         Number(campus_id),
    google_sub:        null,
    name:              name || normalizedEmail.split('@')[0],
    email:             normalizedEmail,
    picture:           '',
    hostel_room:       '',
    phone:             null,
    status:            'active',
    terms_version:     terms_version || null,
    terms_accepted_at: terms_accepted_at || null,
    is_admin:          false,
    is_blocked:        false,
    created_at:        now,
    last_login:        now
  };

  store.users.push(newUser);

  store.user_emails.push({
    id:               store.counters.user_email_id++,
    user_id:          newUser.user_id,
    normalized_email: normalizedEmail,
    verified_at:      now,
    is_primary:       true
  });

  writeDB(store);
  return newUser;
}

function updateUser(userId, fields) {
  const store = readDB();
  const user = store.users.find(u => u.user_id === Number(userId));
  if (!user) return null;

  if (fields.name !== undefined) user.name = fields.name;
  if (fields.picture !== undefined) user.picture = fields.picture;
  if (fields.hostel_room !== undefined) user.hostel_room = fields.hostel_room;
  if (fields.phone !== undefined) user.phone = fields.phone;
  if (fields.status !== undefined) {
    user.status = fields.status;
    user.is_blocked = (fields.status === 'suspended');
  }
  if (fields.terms_version !== undefined) user.terms_version = fields.terms_version;
  if (fields.terms_accepted_at !== undefined) user.terms_accepted_at = fields.terms_accepted_at;
  if (fields.last_login !== undefined) user.last_login = fields.last_login;
  if (fields.campus_id !== undefined) user.campus_id = Number(fields.campus_id);
  if (fields.email !== undefined) user.email = fields.email.toLowerCase().trim();

  writeDB(store);
  return user;
}

function updateUserProfile(userId, { hostel_room, phone, name, terms_accepted }) {
  const store = readDB();
  const user  = store.users.find(u => u.user_id === Number(userId));
  if (!user) return null;

  if (hostel_room !== undefined) user.hostel_room = hostel_room;
  if (phone !== undefined)       user.phone       = phone;
  if (name !== undefined && String(name).trim()) user.name = String(name).trim();
  if (terms_accepted) {
    user.terms_version = 'v1.0';
    user.terms_accepted_at = new Date().toISOString();
  }

  writeDB(store);
  return user;
}

function setUserStatus(userId, status) {
  return updateUser(userId, { status });
}

function upsertUserBySub({ google_sub, email, name, picture }) {
  const store = readDB();
  const now   = new Date().toISOString();

  const existing = store.users.find(u => u.google_sub === google_sub);
  if (existing) {
    existing.name       = name || existing.name;
    existing.picture    = picture || existing.picture;
    existing.last_login = now;
    writeDB(store);
    return existing;
  }

  const byEmail = store.users.find(
    u => u.email.toLowerCase() === email.toLowerCase()
  );
  if (byEmail) {
    byEmail.google_sub  = google_sub;
    byEmail.picture     = picture || byEmail.picture;
    byEmail.last_login  = now;
    writeDB(store);
    return byEmail;
  }

  const newUser = {
    user_id:           store.counters.user_id++,
    campus_id:         1,
    google_sub,
    name:              name || email.split('@')[0],
    email:             email.toLowerCase().trim(),
    picture:           picture || '',
    hostel_room:       '',
    phone:             null,
    status:            'active',
    terms_version:     'v1.0',
    terms_accepted_at: now,
    is_admin:          false,
    is_blocked:        false,
    created_at:        now,
    last_login:        now
  };
  store.users.push(newUser);
  writeDB(store);
  return newUser;
}

function createUser({ name, email, hostel_room }) {
  return createUserWithCampus({
    campus_id:         1,
    email,
    name,
    terms_version:     'v1.0',
    terms_accepted_at: new Date().toISOString()
  });
}

// ─── USER EMAILS ─────────────────────────────────────────────────────────────

function getUserEmails(userId) {
  return readDB().user_emails.filter(ue => ue.user_id === Number(userId));
}

function findUserEmail(normalizedEmail) {
  const target = String(normalizedEmail).toLowerCase().trim();
  return readDB().user_emails.find(ue => ue.normalized_email.toLowerCase() === target) || null;
}

function addUserEmail({ user_id, normalized_email, is_primary = false, verified_at = null }) {
  const store = readDB();
  const target = normalized_email.toLowerCase().trim();

  if (is_primary) {
    store.user_emails.forEach(ue => {
      if (ue.user_id === Number(user_id)) ue.is_primary = false;
    });
  }

  const newRow = {
    id:               store.counters.user_email_id++,
    user_id:          Number(user_id),
    normalized_email: target,
    verified_at:      verified_at || new Date().toISOString(),
    is_primary:       Boolean(is_primary)
  };

  store.user_emails.push(newRow);
  writeDB(store);
  return newRow;
}

function updatePrimaryEmail(userId, newNormalizedEmail) {
  const store = readDB();
  const uid = Number(userId);
  const target = newNormalizedEmail.toLowerCase().trim();

  const user = store.users.find(u => u.user_id === uid);
  if (!user) return false;
  user.email = target;

  store.user_emails.forEach(ue => {
    if (ue.user_id === uid) ue.is_primary = false;
  });

  let existingRow = store.user_emails.find(
    ue => ue.user_id === uid && ue.normalized_email.toLowerCase() === target
  );
  if (existingRow) {
    existingRow.is_primary = true;
    existingRow.verified_at = new Date().toISOString();
  } else {
    store.user_emails.push({
      id:               store.counters.user_email_id++,
      user_id:          uid,
      normalized_email: target,
      verified_at:      new Date().toISOString(),
      is_primary:       true
    });
  }

  writeDB(store);
  return true;
}

// ─── LOGIN CHALLENGES ─────────────────────────────────────────────────────────

function createLoginChallenge({
  id,
  email_lookup_hash,
  protected_email,
  campus_id,
  purpose = 'login',
  code_digest,
  link_token_digest = null,
  expires_at
}) {
  const store = readDB();
  const newChallenge = {
    id,
    email_lookup_hash,
    protected_email,
    campus_id:         Number(campus_id),
    purpose,
    code_digest,
    link_token_digest,
    expires_at,
    failed_attempts:   0,
    consumed_at:       null,
    invalidated_at:    null,
    created_at:        new Date().toISOString()
  };
  store.login_challenges.push(newChallenge);
  writeDB(store);
  return newChallenge;
}

function getLoginChallenge(id) {
  return readDB().login_challenges.find(c => c.id === id) || null;
}

function incrementChallengeAttempts(id) {
  const store = readDB();
  const challenge = store.login_challenges.find(c => c.id === id);
  if (!challenge) return null;

  challenge.failed_attempts = (challenge.failed_attempts || 0) + 1;
  if (challenge.failed_attempts >= 5 && !challenge.invalidated_at) {
    challenge.invalidated_at = new Date().toISOString();
  }

  writeDB(store);
  return challenge;
}

function invalidateChallenge(id) {
  const store = readDB();
  const challenge = store.login_challenges.find(c => c.id === id);
  if (!challenge) return null;
  challenge.invalidated_at = new Date().toISOString();
  writeDB(store);
  return challenge;
}

function invalidateActiveChallengesForEmail(email_lookup_hash, purpose = 'login') {
  const store = readDB();
  const now = new Date().toISOString();
  let count = 0;
  store.login_challenges.forEach(c => {
    if (
      c.email_lookup_hash === email_lookup_hash &&
      c.purpose === purpose &&
      !c.consumed_at &&
      !c.invalidated_at
    ) {
      c.invalidated_at = now;
      count++;
    }
  });
  if (count > 0) writeDB(store);
  return count;
}

function consumeChallenge(id) {
  const store = readDB();
  const challenge = store.login_challenges.find(c => c.id === id);
  if (!challenge) return null;
  challenge.consumed_at = new Date().toISOString();
  writeDB(store);
  return challenge;
}

function updateLoginChallenge(id, fields) {
  const store = readDB();
  const challenge = store.login_challenges.find(c => c.id === id);
  if (!challenge) return null;
  Object.assign(challenge, fields);
  writeDB(store);
  return challenge;
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

function createSession({ id, user_id, hashed_token, idle_expires_at, absolute_expires_at, ip_hash = null, user_agent = null }) {
  const store = readDB();
  const now = new Date().toISOString();
  const newSession = {
    id,
    user_id:             Number(user_id),
    hashed_token,
    idle_expires_at,
    absolute_expires_at,
    revoked_at:          null,
    created_at:          now,
    last_active_at:      now,
    ip_hash,
    user_agent
  };
  store.sessions.push(newSession);
  writeDB(store);
  return newSession;
}

function getSessionByHashedToken(hashedToken) {
  return readDB().sessions.find(s => s.hashed_token === hashedToken) || null;
}

function touchSession(sessionId, newIdleExpiresAt) {
  const store = readDB();
  const session = store.sessions.find(s => s.id === sessionId);
  if (!session) return null;
  session.idle_expires_at = newIdleExpiresAt;
  session.last_active_at = new Date().toISOString();
  writeDB(store);
  return session;
}

function revokeSession(sessionId) {
  const store = readDB();
  const session = store.sessions.find(s => s.id === sessionId);
  if (!session) return false;
  session.revoked_at = new Date().toISOString();
  writeDB(store);
  return true;
}

function revokeUserSessions(userId) {
  const store = readDB();
  const uid = Number(userId);
  const now = new Date().toISOString();
  let changed = false;
  store.sessions.forEach(s => {
    if (s.user_id === uid && !s.revoked_at) {
      s.revoked_at = now;
      changed = true;
    }
  });
  if (changed) writeDB(store);
}

// ─── AUTH EVENTS ─────────────────────────────────────────────────────────────

function logAuthEvent({ event_type, user_id = null, campus_id = null, email_lookup_hash = null, ip_hash = null, user_agent = null, details = {} }) {
  const store = readDB();
  const newEvent = {
    id:                store.counters.auth_event_id++,
    event_type,
    user_id:           user_id ? Number(user_id) : null,
    campus_id:         campus_id ? Number(campus_id) : null,
    email_lookup_hash: email_lookup_hash || null,
    ip_hash:           ip_hash || null,
    user_agent:        user_agent || null,
    details:           details || {},
    timestamp:         new Date().toISOString()
  };
  store.auth_events.push(newEvent);

  if (store.auth_events.length > 5000) {
    store.auth_events = store.auth_events.slice(-5000);
  }

  writeDB(store);
  return newEvent;
}

function getAuthEvents(filters = {}) {
  const store = readDB();
  let list = [...store.auth_events];
  if (filters.event_type) list = list.filter(e => e.event_type === filters.event_type);
  if (filters.user_id)    list = list.filter(e => e.user_id === Number(filters.user_id));
  if (filters.campus_id)  list = list.filter(e => e.campus_id === Number(filters.campus_id));
  return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ─── CAMPUS REQUESTS ─────────────────────────────────────────────────────────

function createCampusRequest({ campus_name, domain, contact_email, notes = '' }) {
  const store = readDB();
  const newReq = {
    id:            store.counters.campus_request_id++,
    campus_name:   String(campus_name).trim(),
    domain:        String(domain).toLowerCase().trim(),
    contact_email: String(contact_email).trim(),
    notes:         String(notes || '').trim(),
    status:        'pending',
    created_at:    new Date().toISOString(),
    reviewed_at:   null
  };
  store.campus_requests.push(newReq);
  writeDB(store);
  return newReq;
}

function getCampusRequests(status = null) {
  const store = readDB();
  let list = [...store.campus_requests];
  if (status) list = list.filter(r => r.status === status);
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateCampusRequestStatus(id, status) {
  const store = readDB();
  const req = store.campus_requests.find(r => r.id === Number(id));
  if (!req) return null;
  req.status = status;
  req.reviewed_at = new Date().toISOString();
  writeDB(store);
  return req;
}

// ─── EMAIL CHANGE TRANSACTIONS ───────────────────────────────────────────────

function createEmailChangeTransaction({ id, user_id, old_email, new_email, campus_id, old_challenge_id, new_challenge_id, expires_at }) {
  const store = readDB();
  const tx = {
    id,
    user_id:          Number(user_id),
    old_email:        old_email.toLowerCase().trim(),
    new_email:        new_email.toLowerCase().trim(),
    campus_id:        Number(campus_id),
    old_challenge_id,
    new_challenge_id,
    old_verified_at:  null,
    new_verified_at:  null,
    completed_at:     null,
    created_at:       new Date().toISOString(),
    expires_at
  };
  store.email_change_transactions.push(tx);
  writeDB(store);
  return tx;
}

function getEmailChangeTransaction(id) {
  return readDB().email_change_transactions.find(t => t.id === id) || null;
}

function updateEmailChangeTransaction(id, fields) {
  const store = readDB();
  const tx = store.email_change_transactions.find(t => t.id === id);
  if (!tx) return null;
  Object.assign(tx, fields);
  writeDB(store);
  return tx;
}

// ─── ITEMS ───────────────────────────────────────────────────────────────────

const VALID_CATEGORIES  = ['Books', 'Electronics', 'Hostel Essentials', 'Stationery', 'Other'];
const VALID_CONDITIONS  = ['Good', 'Like new', 'Brand new', 'Fair'];
const VALID_IMAGE_TYPES = ['book', 'calculator', 'bucket', 'drafter', 'kettle', 'labcoat', 'default'];

function _itemOut(item, store) {
  const seller = store.users.find(u => u.user_id === item.seller_id);
  return {
    ...item,
    seller_name:  seller ? seller.name  : 'Student',
    seller_email: '',
    seller_hostel: seller ? seller.hostel_room : item.hostel_room
  };
}

function getItems(filters = {}) {
  const store = readDB();
  let list = store.items
    .filter(i => i.status !== 'Removed')
    .map(i => _itemOut(i, store));

  if (filters.campus_id) {
    list = list.filter(i => i.campus_id === Number(filters.campus_id));
  }
  if (filters.category && filters.category !== 'All') {
    list = list.filter(i => i.category.toLowerCase() === filters.category.toLowerCase());
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.details.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.hostel_room && i.hostel_room.toLowerCase().includes(q))
    );
  }
  if (filters.status) {
    list = list.filter(i => i.status.toLowerCase() === filters.status.toLowerCase());
  } else {
    list = list.filter(i => i.status === 'Available');
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getItemById(id) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item) return null;
  return _itemOut(item, store);
}

function createItem({ seller_id, title, category, price, condition, hostel_room, details, image_url, image_type }) {
  const store  = readDB();
  const seller = store.users.find(u => u.user_id === Number(seller_id));
  const now    = new Date().toISOString();
  const newItem = {
    item_id:     store.counters.item_id++,
    seller_id:   Number(seller_id),
    campus_id:   seller ? (seller.campus_id || 1) : 1,
    title:       String(title).slice(0, 120),
    category:    VALID_CATEGORIES.includes(category) ? category : 'Other',
    price:       Math.max(0, Math.round(Number(price))) || 0,
    condition:   VALID_CONDITIONS.includes(condition) ? condition : 'Good',
    hostel_room: hostel_room || (seller ? seller.hostel_room : 'Hostel Gate'),
    details:     String(details || '').slice(0, 1000),
    status:      'Available',
    image_type:  VALID_IMAGE_TYPES.includes(image_type) ? image_type : 'default',
    image_url:   image_url || '',
    created_at:  now
  };
  store.items.unshift(newItem);
  writeDB(store);
  return _itemOut(newItem, store);
}

function updateItemStatus(id, status) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item) return null;
  item.status = status;
  writeDB(store);
  return item;
}

function updateItem(id, sellerId, fields) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item || item.seller_id !== Number(sellerId)) return null;
  const { title, category, price, condition, details, image_type } = fields;
  if (title)      item.title     = String(title).slice(0, 120);
  if (category && VALID_CATEGORIES.includes(category))  item.category  = category;
  if (price  !== undefined) item.price    = Math.max(0, Math.round(Number(price))) || 0;
  if (condition && VALID_CONDITIONS.includes(condition)) item.condition = condition;
  if (details !== undefined) item.details = String(details).slice(0, 1000);
  if (image_type && VALID_IMAGE_TYPES.includes(image_type)) item.image_type = image_type;
  writeDB(store);
  return _itemOut(item, store);
}

function deleteItem(id, sellerId) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item || item.seller_id !== Number(sellerId)) return false;
  item.status = 'Removed';
  writeDB(store);
  return true;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────

const VALID_PICKUP_LOCATIONS = [
  'Hostel Gate 2 (Boys)',
  'Hostel Gate 1 (Main Entrance)',
  'Hostel Gate 7 (Girls Block)',
  'College Cafeteria Gate'
];
const VALID_PAYMENT_METHODS  = ['Cash', 'UPI'];

function _orderOut(order, store) {
  const buyer  = store.users.find(u => u.user_id === order.buyer_id);
  const seller = store.users.find(u => u.user_id === order.seller_id);
  const item   = store.items.find(i => i.item_id === order.item_id);
  return {
    ...order,
    buyer_name:     buyer  ? buyer.name  : 'Student',
    seller_name:    seller ? seller.name : 'Student',
    item_condition: item   ? item.condition : 'Good'
  };
}

function createOrder({ buyer_id, items: cartItems, pickup_location, payment_method, hostel_room }) {
  const store    = readDB();
  const buyer    = store.users.find(u => u.user_id === Number(buyer_id));
  const now      = new Date().toISOString();
  const created  = [];

  for (const entry of cartItems) {
    const targetItem = store.items.find(i => i.item_id === Number(entry.item_id));
    if (!targetItem || targetItem.status !== 'Available') continue;

    const quantity = Math.min(Math.max(1, Math.round(Number(entry.quantity) || 1)), 10);
    const lineTotal = targetItem.price * quantity;

    const newOrder = {
      order_id:        store.counters.order_id++,
      buyer_id:        Number(buyer_id),
      seller_id:       targetItem.seller_id,
      item_id:         targetItem.item_id,
      item_title:      targetItem.title,
      quantity,
      total:           lineTotal,
      pickup_location: VALID_PICKUP_LOCATIONS.includes(pickup_location)
                         ? pickup_location
                         : 'Hostel Gate 2 (Boys)',
      hostel_room:     hostel_room || (buyer ? buyer.hostel_room : ''),
      payment_method:  VALID_PAYMENT_METHODS.includes(payment_method) ? payment_method : 'Cash',
      status:          'Pending',
      created_at:      now
    };
    store.orders.unshift(newOrder);
    targetItem.status = 'Reserved';
    created.push(_orderOut(newOrder, store));
  }

  writeDB(store);
  if (created.length === 0) return null;
  return created.length === 1 ? created[0] : created;
}

function getOrders(userId = null) {
  const store = readDB();
  let list    = store.orders.map(o => _orderOut(o, store));
  if (userId) {
    const uid = Number(userId);
    list = list.filter(o => o.buyer_id === uid || o.seller_id === uid);
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getOrderById(orderId) {
  const store = readDB();
  const order = store.orders.find(o => o.order_id === Number(orderId));
  if (!order) return null;
  return _orderOut(order, store);
}

function updateOrderStatus(orderId, status, requestingUserId) {
  const store = readDB();
  const order = store.orders.find(o => o.order_id === Number(orderId));
  if (!order || order.status !== 'Pending') return null;

  const uid = Number(requestingUserId);
  if (status === 'Completed' && order.seller_id !== uid) return null;
  if (status === 'Cancelled' && order.buyer_id  !== uid) return null;
  if (!['Completed', 'Cancelled'].includes(status))       return null;

  order.status = status;
  const targetItem = store.items.find(i => i.item_id === order.item_id);
  if (targetItem) {
    targetItem.status = status === 'Completed' ? 'Sold' : 'Available';
  }
  writeDB(store);
  return _orderOut(order, store);
}

// ─── MESSAGES / CHAT ─────────────────────────────────────────────────────────

const MAX_MSG_LENGTH = 1000;

function _msgOut(msg, store) {
  const sender   = store.users.find(u => u.user_id === msg.sender_id);
  const receiver = store.users.find(u => u.user_id === msg.receiver_id);
  return {
    ...msg,
    sender_name:   sender   ? sender.name   : 'Student',
    receiver_name: receiver ? receiver.name : 'Student'
  };
}

function getMessages(itemId, userId1, userId2) {
  const store = readDB();
  let msgs    = store.messages.filter(m => m.item_id === Number(itemId));

  if (userId1 && userId2) {
    const u1 = Number(userId1);
    const u2 = Number(userId2);
    msgs = msgs.filter(m =>
      (m.sender_id === u1 && m.receiver_id === u2) ||
      (m.sender_id === u2 && m.receiver_id === u1)
    );
  }

  return msgs
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(m => _msgOut(m, store));
}

function createMessage({ item_id, sender_id, receiver_id, message_text }) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(item_id));

  let finalReceiver = Number(receiver_id);
  if (!finalReceiver && item) {
    finalReceiver = (Number(sender_id) === item.seller_id) ? 2 : item.seller_id;
  }

  const now = new Date().toISOString();
  const msg = {
    message_id:   store.counters.message_id++,
    item_id:      Number(item_id),
    sender_id:    Number(sender_id),
    receiver_id:  finalReceiver,
    message_text: String(message_text).trim().slice(0, MAX_MSG_LENGTH),
    timestamp:    now,
    read_at:      null
  };
  store.messages.push(msg);
  writeDB(store);
  return _msgOut(msg, store);
}

function markMessagesRead(itemId, readerId) {
  const store = readDB();
  let changed = false;
  const now   = new Date().toISOString();
  store.messages.forEach(m => {
    if (m.item_id === Number(itemId) && m.receiver_id === Number(readerId) && !m.read_at) {
      m.read_at = now;
      changed = true;
    }
  });
  if (changed) writeDB(store);
}

function countUnread(userId) {
  const store = readDB();
  return store.messages.filter(
    m => m.receiver_id === Number(userId) && !m.read_at
  ).length;
}

function getChatThreads(userId) {
  const store    = readDB();
  const uid      = Number(userId);
  const threadMap = new Map();

  store.messages.forEach(m => {
    if (m.sender_id !== uid && m.receiver_id !== uid) return;
    const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    const key     = `${m.item_id}_${otherId}`;
    const item    = store.items.find(i => i.item_id === m.item_id);
    const other   = store.users.find(u => u.user_id === otherId);

    threadMap.set(key, {
      item_id:         m.item_id,
      item_title:      item  ? item.title : 'Item',
      item_price:      item  ? item.price : 0,
      other_user_id:   otherId,
      other_user_name: other ? other.name : 'Student',
      last_message:    m.message_text,
      last_timestamp:  m.timestamp,
      unread_count:    store.messages.filter(
        x => x.item_id === m.item_id &&
             x.sender_id === otherId &&
             x.receiver_id === uid &&
             !x.read_at
      ).length
    });
  });

  return Array.from(threadMap.values())
    .sort((a, b) => new Date(b.last_timestamp) - new Date(a.last_timestamp));
}

// ─── WISHLIST ─────────────────────────────────────────────────────────────────

function getWishlist(userId) {
  const store = readDB();
  const uid   = Number(userId);
  const ids   = store.wishlist
    .filter(w => w.user_id === uid)
    .map(w => w.item_id);
  return store.items
    .filter(i => ids.includes(i.item_id) && i.status === 'Available')
    .map(i => _itemOut(i, store));
}

function addToWishlist(userId, itemId) {
  const store = readDB();
  const uid   = Number(userId);
  const iid   = Number(itemId);
  if (!store.wishlist.find(w => w.user_id === uid && w.item_id === iid)) {
    store.wishlist.push({ user_id: uid, item_id: iid });
    writeDB(store);
  }
}

function removeFromWishlist(userId, itemId) {
  const store = readDB();
  const uid   = Number(userId);
  const iid   = Number(itemId);
  store.wishlist = store.wishlist.filter(
    w => !(w.user_id === uid && w.item_id === iid)
  );
  writeDB(store);
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  // Campuses & Domains
  getCampuses,
  getActiveCampusesWithDomains,
  getCampusById,
  getCampusDomains,
  getDomainsForCampus,
  createCampus,
  updateCampusStatus,
  createCampusDomain,
  updateCampusDomainStatus,
  // Users
  getUserById,
  getUserByEmail,
  getUsers,
  createUserWithCampus,
  updateUser,
  updateUserProfile,
  setUserStatus,
  upsertUserBySub,
  createUser,
  // User Emails
  getUserEmails,
  findUserEmail,
  addUserEmail,
  updatePrimaryEmail,
  // Login Challenges
  createLoginChallenge,
  getLoginChallenge,
  updateLoginChallenge,
  incrementChallengeAttempts,
  invalidateChallenge,
  invalidateActiveChallengesForEmail,
  consumeChallenge,
  // Sessions
  createSession,
  getSessionByHashedToken,
  touchSession,
  revokeSession,
  revokeUserSessions,
  // Auth Events
  logAuthEvent,
  getAuthEvents,
  // Campus Requests
  createCampusRequest,
  getCampusRequests,
  updateCampusRequestStatus,
  // Email Change Transactions
  createEmailChangeTransaction,
  getEmailChangeTransaction,
  updateEmailChangeTransaction,
  // Items
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  // Orders
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  // Chat / Messages
  getMessages,
  createMessage,
  markMessagesRead,
  countUnread,
  getChatThreads,
  // Wishlist
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  // Constants
  VALID_CATEGORIES,
  VALID_CONDITIONS,
  VALID_PICKUP_LOCATIONS,
  VALID_PAYMENT_METHODS
};
