// MongoDB initialization script
// Creates database, user, and initial indexes

// Switch to the omnisupport database
db = db.getSiblingDB('omnisupport');

// Create application user
db.createUser({
  user: 'omnisupport_app',
  pwd: 'change_this_password_in_production',
  roles: [
    { role: 'readWrite', db: 'omnisupport' },
  ],
});

// Create indexes for optimal performance
print('Creating indexes...');

// Companies collection
db.companies.createIndex({ 'settings.subdomain': 1 }, { unique: true, sparse: true });
db.companies.createIndex({ 'subscription.planType': 1 });
db.companies.createIndex({ createdAt: 1 });

// Users collection
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ companyId: 1 });
db.users.createIndex({ companyId: 1, role: 1 });
db.users.createIndex({ auth0Id: 1 }, { unique: true, sparse: true });

// Tickets collection
db.tickets.createIndex({ companyId: 1, status: 1 });
db.tickets.createIndex({ companyId: 1, assignedTo: 1 });
db.tickets.createIndex({ companyId: 1, createdAt: -1 });
db.tickets.createIndex({ companyId: 1, priority: 1, createdAt: -1 });
db.tickets.createIndex({ companyId: 1, source: 1 });
db.tickets.createIndex({ 'customer.email': 1 });
db.tickets.createIndex({ 'slaBreachAt': 1 }, { sparse: true });
db.tickets.createIndex({ status: 1, slaBreachAt: 1 });

// Call logs collection
db.calllogs.createIndex({ companyId: 1, createdAt: -1 });
db.calllogs.createIndex({ companyId: 1, status: 1 });
db.calllogs.createIndex({ companyId: 1, agentId: 1 });
db.calllogs.createIndex({ companyId: 1, ticketId: 1 });
db.calllogs.createIndex({ vapiCallId: 1 }, { unique: true, sparse: true });

// Voice agents collection
db.voiceagents.createIndex({ companyId: 1 });
db.voiceagents.createIndex({ companyId: 1, isActive: 1 });
db.voiceagents.createIndex({ vapiAssistantId: 1 }, { unique: true, sparse: true });

// Analytics events collection (TTL index for automatic cleanup)
db.analyticsevents.createIndex({ companyId: 1, timestamp: -1 });
db.analyticsevents.createIndex({ companyId: 1, eventType: 1 });
db.analyticsevents.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days TTL
);

// Integrations collection
db.integrations.createIndex({ companyId: 1, platform: 1 }, { unique: true });
db.integrations.createIndex({ companyId: 1, isActive: 1 });

// Knowledge base documents collection
db.kbdocuments.createIndex({ companyId: 1 });
db.kbdocuments.createIndex({ companyId: 1, category: 1 });
db.kbdocuments.createIndex({ pineconeId: 1 }, { sparse: true });

// Canned responses collection
db.cannedresponses.createIndex({ companyId: 1 });
db.cannedresponses.createIndex({ companyId: 1, category: 1 });
db.cannedresponses.createIndex({ companyId: 1, shortcut: 1 });

// Activity logs collection (TTL index)
db.activitylogs.createIndex({ companyId: 1, createdAt: -1 });
db.activitylogs.createIndex({ userId: 1, createdAt: -1 });
db.activitylogs.createIndex({ entityType: 1, entityId: 1, createdAt: -1 });
db.activitylogs.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 } // 180 days TTL
);

// Notifications collection (TTL index)
db.notifications.createIndex({ userId: 1, read: 1, createdAt: -1 });
db.notifications.createIndex({ userId: 1, createdAt: -1 });
db.notifications.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days TTL
);

// Sessions collection (for rate limiting, etc.)
db.sessions.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60 } // 24 hours TTL
);

print('Indexes created successfully!');
print('Database initialization complete.');
