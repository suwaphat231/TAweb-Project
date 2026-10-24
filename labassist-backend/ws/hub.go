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
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				if uClients, exists := h.userClients[client.UserID]; exists {
					delete(uClients, client)
					if len(uClients) == 0 {
						delete(h.userClients, client.UserID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("[WS] Client disconnected: user_id=%d, total=%d", client.UserID, len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
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
