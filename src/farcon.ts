import { Client, IdentifierKind, type Group } from "@xmtp/node-sdk";
import { log, isSameString } from "./helpers/utils.js";

const GROUP_NAME = "Farcon";
const FARCON_ADMIN_ADDRESS = ""; // Fill out the admin address

export async function findOrCreateFarconGroup(client: Client): Promise<Group> {
  const group = await findGroup(client);
  if (group) {
    log(`[INFO] Found existing Farcon group`);
    return group;
  }

  log(`[INFO] Creating new Farcon group...`);

  const newGroup = await client.conversations.newGroup([], {
    groupName: GROUP_NAME,
    groupDescription: "The Farcon community group",
  });

  await addAdminToGroup(newGroup);
  return newGroup;
}

const findGroup = async (client: Client): Promise<Group | undefined> => {
  log(`[INFO] Looking for existing Farcon group...`);
  await client.conversations.sync();

  const conversations = await client.conversations.list();

  const group = conversations.find((g) => (g as Group).name === GROUP_NAME) as
    | Group
    | undefined;

  return group;
};

const addAdminToGroup = async (group: Group) => {
  if (!FARCON_ADMIN_ADDRESS) {
    log(`[ERROR] FARCON_ADMIN_ADDRESS is not set`);
    return;
  }

  log(`[INFO] Adding admin ${FARCON_ADMIN_ADDRESS} to group...`);

  await group.addMembersByIdentifiers([
    {
      identifier: FARCON_ADMIN_ADDRESS,
      identifierKind: IdentifierKind.Ethereum,
    },
  ]);

  const member = (await group.members()).find(
    (member: {
      accountIdentifiers: Array<{
        identifierKind: number;
        identifier: string;
      }>;
      inboxId: string;
    }) =>
      member.accountIdentifiers.some(
        (id) =>
          id.identifierKind === IdentifierKind.Ethereum &&
          isSameString(id.identifier, FARCON_ADMIN_ADDRESS)
      )
  );

  if (member) {
    await group.addAdmin(member.inboxId);
    log(`[SUCCESS] Added ${FARCON_ADMIN_ADDRESS} as admin`);
  } else {
    log(
      `[WARNING] Could not find member ${FARCON_ADMIN_ADDRESS} to add as admin`
    );
  }

  log(`[SUCCESS] Farcon group created successfully`);
  return group;
};
