import dotenv from 'dotenv';
dotenv.config();

import { Client, type XmtpEnv, IdentifierKind, type Group } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex } from "./helpers/client.js";
import { logAgentDetails, validateEnvironment } from "./helpers/utils.js";

const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV } = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
]);

// Configuration
const GROUP_NAME = "Farcon";
const ADMIN_ADDRESS = "0x80245b9C0d2Ef322F2554922cA86Cf211a24047F";

async function findOrCreateFarconGroup(client: Client): Promise<Group> {
  console.log("Looking for existing Farcon group...");
  await client.conversations.sync();
  
  const conversations = await client.conversations.list();
  const existingGroup = conversations.find((conv): conv is Group => {
    return Boolean('isGroup' in conv && 
      (conv as any).isGroup && 
      'name' in conv && 
      (conv as any).name === GROUP_NAME
    );
  }) as Group | undefined;

  if (existingGroup) {
    console.log("Found existing Farcon group");
    return existingGroup;
  }

  console.log("Creating new Farcon group...");
  
  // Check if addresses are enabled on XMTP
  const addresses = [
    "0x80245b9C0d2Ef322F2554922cA86Cf211a24047F",
  ].map(addr => ({
    identifier: addr,
    identifierKind: IdentifierKind.Ethereum
  }));
  
  console.log("Checking addresses:", addresses);
  const canMessage = await client.canMessage(addresses);
  console.log("canMessage result:", canMessage);
  
  const enabledAddresses = addresses.filter((addr) => canMessage.get(addr.identifier));
  console.log("Enabled addresses:", enabledAddresses);
  
  // Get inboxIds for enabled addresses
  const inboxIds = await Promise.all(
    enabledAddresses.map(async (addr) => {
      console.log("Getting inbox state for:", addr.identifier);
      const state = await client.preferences.inboxStateFromInboxIds([addr.identifier]);
      console.log("Inbox state:", state);
      return state[0].inboxId;
    })
  );

  if (inboxIds.length === 0) {
    throw new Error("No addresses are enabled on XMTP. Members need to create an XMTP identity first.");
  }

  console.log("Enabled addresses:", enabledAddresses);
  
  const group = await client.conversations.newGroup(
    inboxIds,
    {
      groupName: GROUP_NAME,
      groupDescription: "The Farcon community group",
    }
  );

  // Add admin to group
  await group.addMembersByIdentifiers([{
    identifier: ADMIN_ADDRESS,
    identifierKind: IdentifierKind.Ethereum,
  }]);
  
  const adminMember = (await group.members()).find((member: { 
    accountIdentifiers: Array<{
      identifierKind: number;
      identifier: string;
    }>;
    inboxId: string;
  }) => 
    member.accountIdentifiers.some((id) => 
      id.identifierKind === IdentifierKind.Ethereum && 
      id.identifier.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
    )
  );

  if (adminMember) {
    await group.addAdmin(adminMember.inboxId);
    console.log(`Added ${ADMIN_ADDRESS} as admin`);
  }

  console.log("Farcon group created successfully");
  return group;
}

async function main() {
  const signer = createSigner(WALLET_KEY as `0x${string}`);
  const encryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
  
  const client = await Client.create(signer, encryptionKey, {
    env: XMTP_ENV as XmtpEnv,
  });

  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;
  
  logAgentDetails(address, client.inboxId, XMTP_ENV);

  // Get or create the Farcon group
  const farconGroup = await findOrCreateFarconGroup(client);

  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  console.log("✓ Listening for messages...");
  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    if (
      message?.senderInboxId.toLowerCase() === client.inboxId.toLowerCase() ||
      message?.contentType?.typeId !== "text"
    ) {
      continue;
    }

    try {
      const senderInboxId = message.senderInboxId;
      
      // Get the conversation to reply to the sender
      const conversation = await client.conversations.getConversationById(
        message.conversationId
      );

      if (!conversation) {
        console.log("Could not find the conversation for the message");
        continue;
      }

      // Check if sender is already in the group
      const members = await farconGroup.members();
      const isMember = members.some((member: { inboxId: string }) => 
        member.inboxId.toLowerCase() === senderInboxId.toLowerCase()
      );

      if (!isMember) {
        console.log(`Adding new member ${senderInboxId} to Farcon group...`);
        await farconGroup.addMembers([senderInboxId]);
        
        const welcomeMessage = `Welcome to the Farcon group! You've been added because you messaged our agent.`;
        await farconGroup.send(welcomeMessage);
        
        await conversation.send(
          `I've added you to the Farcon group. Check your conversations to find it!`
        );
        
        console.log(`✓ Added ${senderInboxId} to Farcon group`);
      } else {
        await conversation.send(
          `You're already a member of the Farcon group!`
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error processing message:", errorMessage);
      
      try {
        const conversation = await client.conversations.getConversationById(
          message.conversationId
        );
        if (conversation) {
          await conversation.send(
            "Sorry, I encountered an error processing your message."
          );
        }
      } catch (sendError) {
        console.error(
          "Failed to send error message:",
          sendError instanceof Error ? sendError.message : String(sendError)
        );
      }
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 