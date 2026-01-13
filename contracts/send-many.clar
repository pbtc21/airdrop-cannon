;; SEND-MANY
;; Batch STX transfers in a single transaction.
;; Based on the AIBTC airdrop approach - optimize for maximum recipients per block.
;;
;; Max ~500 recipients per tx to stay well under read limits.
;; Caller must have sufficient STX balance for all transfers + fees.

(define-constant ERR_TRANSFER_FAILED (err u1001))
(define-constant ERR_EMPTY_LIST (err u1002))

;; Single transfer entry
(define-private (send-stx (entry {to: principal, amount: uint}))
  (stx-transfer? (get amount entry) tx-sender (get to entry)))

;; Send to up to 200 recipients (list 1)
(define-public (send-many-1
  (recipients (list 200 {to: principal, amount: uint})))
  (begin
    (asserts! (> (len recipients) u0) ERR_EMPTY_LIST)
    (ok (fold check-send recipients true))))

;; Send to up to 200 recipients (list 2)
(define-public (send-many-2
  (recipients (list 200 {to: principal, amount: uint})))
  (begin
    (asserts! (> (len recipients) u0) ERR_EMPTY_LIST)
    (ok (fold check-send recipients true))))

;; Send to up to 100 recipients (list 3 - smaller for safety margin)
(define-public (send-many-3
  (recipients (list 100 {to: principal, amount: uint})))
  (begin
    (asserts! (> (len recipients) u0) ERR_EMPTY_LIST)
    (ok (fold check-send recipients true))))

;; Combined: Send to up to 500 recipients in one tx
;; Splits into 200 + 200 + 100 to maximize throughput
(define-public (send-many
  (list1 (list 200 {to: principal, amount: uint}))
  (list2 (list 200 {to: principal, amount: uint}))
  (list3 (list 100 {to: principal, amount: uint})))
  (begin
    (fold check-send list1 true)
    (fold check-send list2 true)
    (fold check-send list3 true)
    (ok true)))

;; Helper: Check send result, continue on success
(define-private (check-send
  (entry {to: principal, amount: uint})
  (prev-ok bool))
  (if prev-ok
    (match (send-stx entry)
      success true
      error false)
    false))

;; Read-only: Calculate total amount needed
(define-read-only (calculate-total (recipients (list 500 {to: principal, amount: uint})))
  (fold add-amount recipients u0))

(define-private (add-amount (entry {to: principal, amount: uint}) (total uint))
  (+ total (get amount entry)))
