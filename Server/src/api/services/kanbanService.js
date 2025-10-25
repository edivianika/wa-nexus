import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

/**
 * Helper function to subscribe a contact to a drip campaign via API.
 * @param {number} contactId - The ID of the contact.
 * @param {string} campaignId - The UUID of the campaign.
 * @param {string} ownerId - The UUID of the owner.
 */
const subscribeToCampaign = async (contactId, campaignId, ownerId) => {
  if (!contactId || !campaignId || !ownerId) return;
  logger.info(`[KanbanTrigger] Subscribing contact ${contactId} to campaign ${campaignId} via API`);

  try {
    const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}/subscribers`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': ownerId,
        },
        body: JSON.stringify({
            contact_id: contactId, // Pass the numeric contact ID
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`API call failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const result = await response.json();
    if(result.message === 'Subscriber already exists') {
         logger.info(`[KanbanTrigger] Contact ${contactId} is already a subscriber of campaign ${campaignId}. No action needed.`);
    } else {
         logger.info(`[KanbanTrigger] Successfully subscribed contact ${contactId} to campaign ${campaignId} via API call.`);
    }

  } catch (err) {
      logger.error(`[KanbanTrigger] Exception during API subscribeToCampaign: ${err.message}`);
  }
};

/**
 * Helper function to unsubscribe a contact from a drip campaign via API.
 * @param {number} contactId - The ID of the contact.
 * @param {string} campaignId - The UUID of the campaign.
 * @param {string} ownerId - The UUID of the owner.
 */
const unsubscribeFromCampaign = async (contactId, campaignId, ownerId) => {
  if (!contactId || !campaignId || !ownerId) return;
  logger.info(`[KanbanTrigger] Unsubscribing contact ${contactId} from campaign ${campaignId} via dedicated API endpoint`);

  try {
    const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}/subscribers/by-contact/${contactId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': ownerId,
        }
    });

    if (response.ok) {
        logger.info(`[KanbanTrigger] Successfully unsubscribed contact ${contactId} from campaign ${campaignId}`);
    } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown API error' }));
        logger.error(`[KanbanTrigger] API failed to unsubscribe contact ${contactId}: ${response.status} ${response.statusText}`, { errorData });
    }
  } catch (error) {
    logger.error(`[KanbanTrigger] Exception while unsubscribing contact ${contactId}: ${error.message}`);
  }
};

class KanbanService {
    async getBoards(ownerId) {
        const { data, error } = await supabase
            .from('kanban_boards')
            .select('*')
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: true });

        if (error) throw new Error(error.message);
        return data; // No longer need to map name to title
    }

    async createBoard(title, ownerId) { // Changed parameter from name to title
        // Create a default board
        const { data: boardData, error: boardError } = await supabase
            .from('kanban_boards')
            .insert([{ title, owner_id: ownerId }]) // Only use title
            .select()
            .single();

        if (boardError) throw new Error(boardError.message);

        // Create default columns for the new board
        const defaultColumns = [
            { title: 'To Do', position: 0, board_id: boardData.id, owner_id: ownerId },
            { title: 'In Progress', position: 1, board_id: boardData.id, owner_id: ownerId },
            { title: 'Done', position: 2, board_id: boardData.id, owner_id: ownerId }
        ];

        const { error: columnsError } = await supabase
            .from('kanban_columns')
            .insert(defaultColumns);

        if (columnsError) {
            // If creating columns fails, roll back the board creation
            await supabase.from('kanban_boards').delete().eq('id', boardData.id);
            throw new Error(columnsError.message);
        }

        return boardData;
    }

    async updateBoard(boardId, title, ownerId) { // Changed parameter from name to title
        // First verify the user owns the board
        const { data: existingBoard, error: checkError } = await supabase
            .from('kanban_boards')
            .select('id')
            .eq('id', boardId)
            .eq('owner_id', ownerId)
            .single();

        if (checkError || !existingBoard) {
            return null; // Board not found or user doesn't own it
        }

        const { data, error } = await supabase
            .from('kanban_boards')
            .update({ title: title }) // Only use title
            .eq('id', boardId)
            .eq('owner_id', ownerId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        
        return data;
    }

    async deleteBoard(boardId, ownerId) {
        // First verify the user owns the board
        const { data: existingBoard, error: checkError } = await supabase
            .from('kanban_boards')
            .select('id')
            .eq('id', boardId)
            .eq('owner_id', ownerId)
            .single();

        if (checkError || !existingBoard) {
            return null; // Board not found or user doesn't own it
        }

        // Delete all associated columns and their contacts will be reset
        // First, get all columns for this board that have a drip campaign attached
        const { data: columns, error: columnsError } = await supabase
            .from('kanban_columns')
            .select('id, drip_campaign_id')
            .eq('board_id', boardId)
            .not('drip_campaign_id', 'is', null);

        if (columnsError) {
             logger.error(`[KanbanTrigger] Could not fetch columns for board ${boardId} during deletion: ${columnsError.message}`);
             // We can choose to continue or stop. Let's continue to allow board deletion.
        }

        // --- Drip Campaign Trigger ---
        if (columns && columns.length > 0) {
            const columnIds = columns.map(col => col.id);
            
            // Find all contacts in these columns
            const { data: contacts, error: contactsError } = await supabase
                .from('contacts')
                .select('id, kanban_column_id')
                .in('kanban_column_id', columnIds);
            
            if (contactsError) {
                logger.error(`[KanbanTrigger] Could not fetch contacts for columns on board ${boardId} during deletion: ${contactsError.message}`);
            } else if (contacts && contacts.length > 0) {
                // Create a map for quick lookup
                const columnDripMap = new Map(columns.map(c => [c.id, c.drip_campaign_id]));
                
                // Unsubscribe all contacts from their respective campaigns
                logger.info(`[KanbanTrigger] Unsubscribing ${contacts.length} contacts from various campaigns due to board deletion.`);
                const unsubscribePromises = contacts.map(contact => {
                    const dripId = columnDripMap.get(contact.kanban_column_id);
                    if (dripId) {
                        return unsubscribeFromCampaign(contact.id, dripId, ownerId);
                    }
                    return null;
                }).filter(Boolean); // Filter out any nulls if a contact's column wasn't in our map
                
                await Promise.all(unsubscribePromises);
            }
        }
        
        // Original logic to wipe all contacts and delete columns can now proceed
        const { data: allColumns, error: allColumnsError } = await supabase
            .from('kanban_columns')
            .select('id')
            .eq('board_id', boardId);

        if (allColumnsError) throw new Error(allColumnsError.message);

        // Reset kanban_column_id for all contacts in these columns
        if (allColumns && allColumns.length > 0) {
            const allColumnIds = allColumns.map(col => col.id);
            
            const { error: contactsError } = await supabase
                .from('contacts')
                .update({ kanban_column_id: null })
                .in('kanban_column_id', allColumnIds);

            if (contactsError) throw new Error(contactsError.message);
            
            // Delete the columns
            const { error: deleteColumnsError } = await supabase
                .from('kanban_columns')
                .delete()
                .eq('board_id', boardId);

            if (deleteColumnsError) throw new Error(deleteColumnsError.message);
        }

        // Finally delete the board
        const { error } = await supabase
            .from('kanban_boards')
            .delete()
            .eq('id', boardId)
            .eq('owner_id', ownerId);

        if (error) throw new Error(error.message);
        return true;
    }

    async createColumn(boardId, title, position, ownerId, dripCampaignId) {
        const { data, error } = await supabase
            .from('kanban_columns')
            .insert({
                board_id: boardId,
                title,
                position,
                owner_id: ownerId,
                drip_campaign_id: dripCampaignId
            })
            .select();

        if (error) {
            logger.error('Error creating kanban column', { 
                err: error, 
                boardId, 
                userId: ownerId 
            });
            throw new Error(error.message);
        }
        
        return data[0];
    }

    async updateColumn(id, ownerId, updates) {
        const { title, drip_campaign_id } = updates;
        const updateData = {};

        if (title !== undefined) {
            updateData.title = title;
        }
        // Allow unlinking by passing null or an empty string
        if (drip_campaign_id !== undefined) {
            updateData.drip_campaign_id = drip_campaign_id === '' ? null : drip_campaign_id;
        }

        if (Object.keys(updateData).length === 0) {
            // Nothing to update, maybe fetch and return existing?
            // For now, let's just say it's successful but did nothing.
            // Or throw an error as the route should have caught this.
            return null;
        }

        const { data, error } = await supabase
            .from('kanban_columns')
            .update(updateData)
            .eq('id', id)
            .eq('owner_id', ownerId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    async deleteColumn(id, ownerId) {
        // First verify the user owns the column
        const { data: existingColumn, error: checkError } = await supabase
            .from('kanban_columns')
            .select('id, drip_campaign_id')
            .eq('id', id)
            .eq('owner_id', ownerId)
            .single();

        if (checkError || !existingColumn) {
            return null; // Column not found or user doesn't own it
        }

        // --- Drip Campaign Trigger ---
        if (existingColumn.drip_campaign_id) {
            // Find all contacts that are in this column
            const { data: contacts, error: contactsError } = await supabase
                .from('contacts')
                .select('id')
                .eq('kanban_column_id', id);

            if (contactsError) {
                logger.error(`[KanbanTrigger] Could not fetch contacts for column ${id} before deletion: ${contactsError.message}`);
            } else if (contacts && contacts.length > 0) {
                // Unsubscribe all of them
                logger.info(`[KanbanTrigger] Unsubscribing ${contacts.length} contacts from campaign ${existingColumn.drip_campaign_id} due to column deletion.`);
                const unsubscribePromises = contacts.map(c => unsubscribeFromCampaign(c.id, existingColumn.drip_campaign_id, ownerId));
                await Promise.all(unsubscribePromises);
            }
        }
        
        // Reset kanban_column_id for all contacts in this column
        const { error: contactsError } = await supabase
            .from('contacts')
            .update({ kanban_column_id: null })
            .eq('kanban_column_id', id);

        if (contactsError) throw new Error(contactsError.message);

        // Delete the column
        const { error } = await supabase
            .from('kanban_columns')
            .delete()
            .eq('id', id)
            .eq('owner_id', ownerId);

        if (error) throw new Error(error.message);
        return true;
    }

    async getBoardWithColumnsAndContacts(boardId, ownerId) {
        // Query the specific board and join its columns and contacts
        const { data: board, error } = await supabase
            .from('kanban_boards')
            .select(`
                *,
                kanban_columns (
                    *,
                    drip_campaigns (name),
                    contacts (
                        *
                    )
                )
            `)
            .eq('id', boardId)
            .eq('owner_id', ownerId)
            .single();

        if (error) {
            this.logger.error('Error fetching board with details from Supabase:', error);
            throw new Error(`Error fetching board details: ${error.message}`);
        }

        if (!board) {
            return null;
        }

        // Sort columns and contacts within columns in JavaScript
        board.kanban_columns.sort((a, b) => a.position - b.position);
        board.kanban_columns.forEach(column => {
            if (column.contacts) {
                column.contacts.sort((a, b) => a.kanban_position - b.kanban_position);
                // Extract last note for each contact
                column.contacts.forEach(contact => {
                    if (contact.notes && Array.isArray(contact.notes) && contact.notes.length > 0) {
                        // Assuming notes are sorted by date, get the last one
                        contact.last_note = contact.notes[contact.notes.length - 1].note;
                    }
                });
            }
        });

        return board;
    }

    async updateContactOrder(columnId, contactIds, ownerId) {
        const { data: toColumn, error: columnError } = await supabase
            .from('kanban_columns')
            .select('id, owner_id, drip_campaign_id')
            .eq('id', columnId)
            .eq('owner_id', ownerId)
            .single();
    
        if (columnError || !toColumn) {
            throw new Error('Column not found or access denied.');
        }

        if (!contactIds) {
            return []; // Nothing to update
        }
    
        // Ensure contacts belong to the user
        // We only need the first contact to check the "from" column
        const firstContactId = contactIds.length > 0 ? Number(contactIds[0]) : null;
        let fromColumnDripId = null;

        if(firstContactId) {
            const { data: contactData, error: contactError } = await supabase
                .from('contacts')
                .select('id, kanban_column_id')
                .eq('owner_id', ownerId)
                .eq('id', firstContactId)
                .single();
            
            if(contactError || !contactData) {
                logger.warn(`Could not verify ownership or find contact ${firstContactId}. Skipping drip triggers.`);
            } else if (contactData.kanban_column_id && contactData.kanban_column_id !== toColumn.id) {
                // The contact is actually moving from a different column. Let's get that column's drip ID.
                const { data: fromColumn, error: fromColError } = await supabase
                    .from('kanban_columns')
                    .select('drip_campaign_id')
                    .eq('id', contactData.kanban_column_id)
                    .single();
                
                if (fromColError) {
                    logger.error(`[KanbanTrigger] Could not fetch 'from' column details: ${fromColError.message}`);
                } else if (fromColumn) {
                    fromColumnDripId = fromColumn.drip_campaign_id;
                }
            }
        }
        
        // Trigger Drip Campaign Logic
        if (fromColumnDripId && fromColumnDripId !== toColumn.drip_campaign_id) {
            await unsubscribeFromCampaign(firstContactId, fromColumnDripId, ownerId);
        }
        if (toColumn.drip_campaign_id && toColumn.drip_campaign_id !== fromColumnDripId) {
            await subscribeToCampaign(firstContactId, toColumn.drip_campaign_id, ownerId);
        }

        // Perform safe, individual updates
        const updatePromises = contactIds.map((id, index) =>
            supabase
                .from('contacts')
                .update({
                    kanban_column_id: columnId,
                    kanban_position: index,
                })
                .eq('id', Number(id))
                .eq('owner_id', ownerId)
        );

        const results = await Promise.all(updatePromises);
        
        const firstError = results.find(result => result.error);
        if (firstError) {
            throw new Error(firstError.error.message);
        }
        
        const data = results.map(res => res.data).flat().filter(Boolean);
        return data;
    }

    async getUnassignedContacts(ownerId) {
        const { data, error } = await supabase
            .from('contacts')
            .select('id, contact_name, phone_number')
            .eq('owner_id', ownerId)
            .is('kanban_column_id', null)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return data;
    }

    async addContactToColumn(contactId, columnId, ownerId) {
        // First, verify the column belongs to the user to prevent misuse
        const { data: columnData, error: columnError } = await supabase
            .from('kanban_columns')
            .select('id, drip_campaign_id')
            .eq('id', columnId)
            .eq('owner_id', ownerId)
            .single();

        if (columnError || !columnData) {
            throw new Error('Column not found or access denied.');
        }

        // Now, update the contact
        const { data: contactData, error: contactError } = await supabase
            .from('contacts')
            .update({ kanban_column_id: columnId })
            .eq('id', contactId)
            .eq('owner_id', ownerId) // Ensure the user owns the contact
            .select()
            .single();
        
        if (contactError) throw new Error(contactError.message);

        // --- Drip Campaign Trigger ---
        if (columnData.drip_campaign_id) {
            await subscribeToCampaign(contactId, columnData.drip_campaign_id, ownerId);
        }

        return contactData;
    }

     async moveContact(contactId, newColumnId, ownerId) {
        // First, verify the user owns the contact and get its current column
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('id, owner_id, kanban_column_id')
            .eq('id', contactId)
            .eq('owner_id', ownerId)
            .single();

        if (contactError || !contact) throw new Error('Contact not found or access denied.');

        // Get the target column with drip campaign info
        const { data: toColumn, error: columnError } = await supabase
            .from('kanban_columns')
            .select('id, owner_id, drip_campaign_id')
            .eq('id', newColumnId)
            .eq('owner_id', ownerId)
            .single();

        if (columnError || !toColumn) throw new Error('Target column not found or access denied.');
        
        // If the contact is already in this column, no need to do anything
        if (contact.kanban_column_id === newColumnId) {
            return contact;
        }
        
        // Handle drip campaign logic if the contact is moving from another column
        let fromColumnDripId = null;
        
        if (contact.kanban_column_id) {
            // Get the source column's drip campaign info
            const { data: fromColumn, error: fromColError } = await supabase
                .from('kanban_columns')
                .select('drip_campaign_id')
                .eq('id', contact.kanban_column_id)
                .single();
            
            if (!fromColError && fromColumn) {
                fromColumnDripId = fromColumn.drip_campaign_id;
            }
        }
        
        // Trigger Drip Campaign Logic
        // 1. Unsubscribe from old campaign if moving from a column with a drip campaign
        if (fromColumnDripId && fromColumnDripId !== toColumn.drip_campaign_id) {
            try {
                await unsubscribeFromCampaign(contactId, fromColumnDripId, ownerId);
                logger.info(`[KanbanTrigger] Contact ${contactId} unsubscribed from campaign ${fromColumnDripId}`);
            } catch (error) {
                logger.error(`[KanbanTrigger] Error unsubscribing contact ${contactId} from campaign ${fromColumnDripId}: ${error.message}`);
            }
        }
        
        // 2. Subscribe to new campaign if moving to a column with a drip campaign
        if (toColumn.drip_campaign_id && toColumn.drip_campaign_id !== fromColumnDripId) {
            try {
                await subscribeToCampaign(contactId, toColumn.drip_campaign_id, ownerId);
                logger.info(`[KanbanTrigger] Contact ${contactId} subscribed to campaign ${toColumn.drip_campaign_id}`);
            } catch (error) {
                logger.error(`[KanbanTrigger] Error subscribing contact ${contactId} to campaign ${toColumn.drip_campaign_id}: ${error.message}`);
            }
        }
        
        // Update the contact's column ID
        const { data, error } = await supabase
            .from('contacts')
            .update({ 
                kanban_column_id: newColumnId
            })
            .eq('id', contactId)
            .eq('owner_id', ownerId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    }
}

export default new KanbanService(); 