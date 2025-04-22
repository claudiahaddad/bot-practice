import { Client, DecodedMessage, type Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";

export async function listenForMessages(client: Client, farconGroup: Group) {
  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    log(`[DEBUG] Message received from: ${message?.senderInboxId}`);
    log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
    log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);

    if (shouldSkip(message, client, farconGroup)) {
      log(
        `[DEBUG] Skipping message from self or non-text content or farcon group ${message?.conversationId}`
      );
      continue;
    }

    try {
      const senderInboxId = message?.senderInboxId ?? "";

      // Get the conversation to reply to the sender
      const conversation = await client.conversations.getConversationById(
        message?.conversationId ?? ""
      );

      if (!conversation) {
        log(`[ERROR] Could not find the conversation for the message`);
        continue;
      }

      // Check if sender is already in the group
      const members = await farconGroup.members();
      const isMember = members.some((member: { inboxId: string }) =>
        isSameString(member.inboxId, senderInboxId)
      );

      if (!isMember) {
        log(`Adding new member ${senderInboxId} to Farcon group...`);
        await farconGroup.addMembers([senderInboxId]);

        const welcomeMessage = `Welcome to the Farcon group! You've been added because you messaged our agent.`;
        await farconGroup.send(welcomeMessage);

        await conversation.send(
          `I've added you to the Farcon group. Check your conversations to find it!`
        );

        log(`Added ${senderInboxId} to Farcon group`);
      } else {
        log(`User ${senderInboxId} is already a member of the group`);
        await conversation.send(`You're already a member of the Farcon group!`);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log(`Error processing message: ${errorMessage}`);

      try {
        const conversation = await client.conversations.getConversationById(
          message?.conversationId ?? ""
        );
        if (conversation) {
          await conversation.send(
            "Sorry, I encountered an error processing your message."
          );
        }
      } catch (sendError) {
        log(
          `Failed to send error message: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`
        );
      }
    }
  }
}

function shouldSkip(
  message: DecodedMessage<any> | undefined,
  client: Client,
  farconGroup: Group
) {
  return (
    isSameString(message?.senderInboxId, client.inboxId) ||
    message?.contentType?.typeId !== "text" ||
    isSameString(message?.conversationId, farconGroup.id)
  );
}
