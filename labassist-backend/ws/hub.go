package ws

import (
	"encoding/json"
	"log"
	"sync"
)

type EventMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Hub struct {
	clients     map[*Client]bool
	userClients map[uint]map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	mu          sync.RWMutex
}

var GlobalHub *Hub
var once sync.Once

func GetHub() *Hub {
	once.Do(func() {
		GlobalHub = newHub()
		go GlobalHub.run()
	})
	return GlobalHub
}

func newHub() *Hub {
	return &Hub{
		broadcast:   make(chan []byte, 256),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		clients:     make(map[*Client]bool),
		userClients: make(map[uint]map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if h.userClients[client.UserID] == nil {
				h.userClients[client.UserID] = make(map[*Client]bool)
			}
			h.userClients[client.UserID][client] = true
			h.mu.Unlock()
			log.Printf("[WS] Client connected: user_id=%d, total=%d", client.UserID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			h.removeLocked(client)
			total := len(h.clients)
			h.mu.Unlock()
			log.Printf("[WS] Client disconnected: user_id=%d, total=%d", client.UserID, total)

		case message := <-h.broadcast:
			// A client whose buffer is full gets dropped, which closes its send
			// channel; that needs the write lock so SendToUser (which holds the
			// read lock) can never send on a channel closed under it.
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					h.removeLocked(client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// removeLocked drops a client from both indexes and closes its send channel.
// It is a no-op for a client already removed, so the channel closes once.
// The caller must hold h.mu for writing.
func (h *Hub) removeLocked(client *Client) {
	if _, ok := h.clients[client]; !ok {
		return
	}
	delete(h.clients, client)
	close(client.send)
	if uClients, exists := h.userClients[client.UserID]; exists {
		delete(uClients, client)
		if len(uClients) == 0 {
			delete(h.userClients, client.UserID)
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(eventType string, payload interface{}) {
	msg, err := json.Marshal(EventMessage{
		Type:    eventType,
		Payload: payload,
	})
	if err != nil {
		return
	}
	h.broadcast <- msg
}

// SendToUser sends a message to all active sessions of a specific user
func (h *Hub) SendToUser(userID uint, eventType string, payload interface{}) {
	msg, err := json.Marshal(EventMessage{
		Type:    eventType,
		Payload: payload,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if uClients, ok := h.userClients[userID]; ok {
		for client := range uClients {
			select {
			case client.send <- msg:
			default:
			}
		}
	}
}
