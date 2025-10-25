import express from 'express';
const router = express.Router();
import kanbanService from '../services/kanbanService.js';
import { loggerUtils as logger } from '../../utils/logger.js';
import { quotaGuard } from '../../middleware/quotaGuard.js';

// Middleware to extract user_id from a custom header
const extractUserId = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        logger.warn('User ID not found in x-user-id header');
        return res.status(401).json({ message: "User identification is missing." });
    }
    req.user = { id: userId }; // Attach user object to the request
    next();
};

// Protect all routes with the user ID extraction middleware
router.use(extractUserId);


// GET /api/kanban/boards
router.get('/boards', async (req, res) => {
    try {
        const userId = req.user.id; 
        let boards = await kanbanService.getBoards(userId);
        
        if (!boards || boards.length === 0) {
            logger.info(`No Kanban board found for user ${userId}, creating a default one.`);
            await kanbanService.createBoard('My First Board', userId);
            boards = await kanbanService.getBoards(userId);
        }
        
        res.json(boards);
    } catch (error) {
        logger.error('Error getting kanban boards', { error: error.message, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// POST /api/kanban/boards - Create a new board
router.post('/boards', quotaGuard('kanban_boards'), async (req, res) => {
    try {
        const { title } = req.body; // Only accept title
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ message: 'Board title is required' });
        }

        const newBoard = await kanbanService.createBoard(title, userId);
        res.status(201).json(newBoard);
    } catch (error) {
        logger.error('Error creating kanban board', { error: error.message, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/kanban/boards/:id - Update a board
router.put('/boards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body; // Only accept title
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ message: 'Board title is required' });
        }

        const updatedBoard = await kanbanService.updateBoard(id, title, userId);
        if (!updatedBoard) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }
        
        res.json(updatedBoard);
    } catch (error) {
        logger.error('Error updating kanban board', { error: error.message, boardId: req.params.id, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/kanban/boards/:id - Delete a board
router.delete('/boards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await kanbanService.deleteBoard(id, userId);
        if (!result) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }
        
        res.json({ message: 'Board deleted successfully' });
    } catch (error) {
        logger.error('Error deleting kanban board', { error: error.message, boardId: req.params.id, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// GET /api/kanban/boards/:id
router.get('/boards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const board = await kanbanService.getBoardWithColumnsAndContacts(id, userId);
        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }
        res.json(board);
    } catch (error) {
        logger.error('Error getting kanban board by id', { error: error.message, boardId: req.params.id, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// POST /api/kanban/boards/:boardId/columns - Create a new column
router.post('/boards/:boardId/columns', async (req, res) => {
    try {
        const { boardId } = req.params;
        const { title, position, drip_campaign_id } = req.body; // Only accept title
        const userId = req.user.id;

        // Log request data untuk debugging
        logger.info('Creating kanban column', { 
            boardId, 
            title, 
            position: position || 0,
            userId,
            drip_campaign_id: drip_campaign_id || null
        });

        if (!title) {
            return res.status(400).json({ message: 'Column title is required' });
        }

        const newColumn = await kanbanService.createColumn(boardId, title, position || 0, userId, drip_campaign_id);
        res.status(201).json(newColumn);
    } catch (error) {
        logger.error('Error creating kanban column', { 
            error: error.message, 
            details: error,
            boardId: req.params.boardId, 
            userId: req.user?.id 
        });
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/kanban/columns/:id - Update a column
router.put('/columns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, drip_campaign_id } = req.body;
        const userId = req.user.id;

        if (title === undefined && drip_campaign_id === undefined) {
            return res.status(400).json({ message: 'Column title or drip_campaign_id is required for an update.' });
        }

        const updatedColumn = await kanbanService.updateColumn(id, userId, { title, drip_campaign_id });
        
        if (!updatedColumn) {
            return res.status(404).json({ message: 'Column not found or access denied' });
        }
        
        res.json(updatedColumn);
    } catch (error) {
        logger.error('Error updating kanban column', { 
            error: error.message, 
            columnId: req.params.id, 
            userId: req.user?.id 
        });
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/kanban/columns/:id - Delete a column
router.delete('/columns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await kanbanService.deleteColumn(id, userId);
        if (!result) {
            return res.status(404).json({ message: 'Column not found or access denied' });
        }
        
        res.json({ message: 'Column deleted successfully' });
    } catch (error) {
        logger.error('Error deleting kanban column', { 
            error: error.message, 
            columnId: req.params.id, 
            userId: req.user?.id 
        });
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/kanban/columns/:columnId/order - Update card order in a column
router.put('/columns/:columnId/order', async (req, res) => {
    try {
        const { columnId } = req.params;
        const { contactIds } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(contactIds)) {
            return res.status(400).json({ message: 'contactIds must be an array' });
        }

        await kanbanService.updateContactOrder(columnId, contactIds, userId);
        res.json({ message: 'Column order updated successfully' });
    } catch (error) {
        logger.error('Error updating kanban column order', { 
            error: error.message, 
            columnId: req.params.columnId, 
            userId: req.user?.id 
        });
        res.status(500).json({ message: error.message });
    }
});

// GET /api/kanban/contacts/unassigned
router.get('/contacts/unassigned', async (req, res) => {
    try {
        const userId = req.user.id;
        const contacts = await kanbanService.getUnassignedContacts(userId);
        res.json(contacts);
    } catch (error) {
        logger.error('Error fetching unassigned contacts', { error: error.message, userId: req.user.id });
        res.status(500).json({ message: error.message });
    }
});

// POST /api/kanban/columns/:columnId/contacts
router.post('/columns/:columnId/contacts', async (req, res) => {
    try {
        const { columnId } = req.params;
        const { contactId } = req.body;
        const userId = req.user.id;

        if (!contactId) {
            return res.status(400).json({ message: 'contactId is required' });
        }

        const newContact = await kanbanService.addContactToColumn(contactId, columnId, userId);
        res.status(201).json(newContact);
    } catch (error) {
        logger.error('Error adding contact to column', { 
            error: error.message, 
            columnId: req.params.columnId, 
            contactId: req.body.contactId,
            userId: req.user.id 
        });
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/kanban/contacts/:contactId/move
router.put('/contacts/:contactId/move', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { newColumnId } = req.body;
        const userId = req.user.id;

        if (!newColumnId) {
            return res.status(400).json({ message: 'newColumnId is required' });
        }

        const updatedContact = await kanbanService.moveContact(contactId, newColumnId, userId);
        res.json(updatedContact);
    } catch (error) {
        logger.error('Error moving kanban contact', { error: error.message, contactId: req.params.contactId, userId: req.user?.id });
        res.status(500).json({ message: error.message });
    }
});

// Tambahkan endpoint baru untuk menangani perubahan kolom kanban dari ContactsPage
// PUT /api/kanban/contacts/:contactId/column
router.put('/contacts/:contactId/column', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { columnId } = req.body;
        const userId = req.user.id;

        if (!columnId) {
            return res.status(400).json({ message: 'columnId is required' });
        }

        // Gunakan moveContact yang sudah ada untuk menangani logika drip campaign
        const updatedContact = await kanbanService.moveContact(contactId, columnId, userId);
        res.json(updatedContact);
    } catch (error) {
        logger.error('Error updating contact kanban column', { 
            error: error.message, 
            contactId: req.params.contactId, 
            userId: req.user?.id 
        });
        res.status(500).json({ message: error.message });
    }
});

export default router;
 