;; SEND-MANY (Bitcoin Faces Airdrop Pattern)
;; Batch STX transfers using the proven 5000+5000+4995 list structure.
;; Max 14,995 recipients per transaction.
;;
;; Based on: https://github.com/bitcoinfaces/airdrop

(define-constant DEPLOYER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))

;; Send STX to up to 14,995 recipients in one transaction
;; Uses three lists: 5000 + 5000 + 4995
(define-public (send-many
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  (begin
    (fold send-stx l1 u0)
    (fold send-stx l2 u0)
    (fold send-stx l3 u0)
    (ok true)))

;; Private: Send STX to single recipient
;; Returns count (for fold), ignores errors to continue batch
(define-private (send-stx (entry {to: principal, amount: uint}) (count uint))
  (begin
    (is-err (stx-transfer? (get amount entry) tx-sender (get to entry)))
    (+ count u1)))

;; Read-only: Calculate total STX needed for a batch
(define-read-only (calculate-total
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  (+ (fold add-amount l1 u0)
     (fold add-amount l2 u0)
     (fold add-amount l3 u0)))

(define-private (add-amount (entry {to: principal, amount: uint}) (total uint))
  (+ total (get amount entry)))

;; Read-only: Get batch counts
(define-read-only (get-batch-info
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  {
    l1-count: (len l1),
    l2-count: (len l2),
    l3-count: (len l3),
    total-count: (+ (len l1) (len l2) (len l3)),
    total-amount: (calculate-total l1 l2 l3)
  })
