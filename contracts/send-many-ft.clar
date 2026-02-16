;; SEND-MANY-FT (SIP-010 Fungible Token Batch Transfers)
;; Generic contract — works with any SIP-010 token via trait parameter.
;; Max 14,995 recipients per transaction using 3-list fold pattern.
;;
;; Clarity 4 — uses restrict-assets? with with-ft for in-contract post conditions.
;; Ensures tx-sender never transfers more tokens than the declared total.
;;
;; Pattern: The <ft-trait> is passed as the fold accumulator so the fold helper
;; can call contract-call? on it directly. Counts are tracked via data-vars.
;;
;; Based on: https://github.com/bitcoinfaces/airdrop

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR_EMPTY_LISTS (err u400))
(define-constant ERR_POST_CONDITION (err u500))

;; Sender stored before fold (fold helpers can't capture outer scope)
(define-data-var batch-sender principal tx-sender)
;; Counters for ok/fail (fold accumulator is the trait, so counts go here)
(define-data-var ok-count uint u0)
(define-data-var fail-count uint u0)

;; Batch send any SIP-010 FT to up to 14,995 recipients in one tx.
;; token: the SIP-010 token contract to transfer
;; token-name: the define-fungible-token name (for post-condition)
;; total-amount: sum of all amounts across all three lists
(define-public (send-many
  (token <ft-trait>)
  (token-name (string-ascii 128))
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint}))
  (total-amount uint))
  (let (
    (sender tx-sender)
    (count (+ (len l1) (len l2) (len l3)))
  )
    (asserts! (> count u0) ERR_EMPTY_LISTS)
    ;; Init state for fold
    (var-set batch-sender sender)
    (var-set ok-count u0)
    (var-set fail-count u0)
    ;; In-contract post condition: sender loses at most total-amount of this FT
    (match (restrict-assets? sender
      ((with-ft (contract-of token) token-name total-amount))
      (begin
        ;; Fold over all three lists — trait is the accumulator
        (fold send-ft l1 token)
        (fold send-ft l2 token)
        (fold send-ft l3 token)
        ;; Emit summary event
        (let (
          (ok (var-get ok-count))
          (fail (var-get fail-count))
        )
          (print {
            notification: "BatchTransfer",
            payload: {
              token: (contract-of token),
              sender: sender,
              total-ok: ok,
              total-fail: fail,
              total-count: count,
              total-amount: total-amount
            }
          })
          {ok: ok, fail: fail}
        )
      ))
      result (ok result)
      violation-idx ERR_POST_CONDITION
    )
  )
)

;; Private: transfer FT to a single recipient.
;; The trait is passed as the fold accumulator so we can call contract-call? on it.
;; Fault-tolerant — failures increment fail counter, batch continues.
(define-private (send-ft
  (entry {to: principal, amount: uint})
  (token <ft-trait>))
  (let (
    (sender (var-get batch-sender))
  )
    (match (contract-call? token transfer
      (get amount entry) sender (get to entry) none)
      success
        (begin (var-set ok-count (+ (var-get ok-count) u1)) token)
      error
        (begin (var-set fail-count (+ (var-get fail-count) u1)) token)
    )
  )
)

;; Read-only: Calculate total token amount needed for a batch
(define-read-only (calculate-total
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  (+ (fold add-amount l1 u0)
     (fold add-amount l2 u0)
     (fold add-amount l3 u0)))

(define-private (add-amount (entry {to: principal, amount: uint}) (total uint))
  (+ total (get amount entry)))

;; Read-only: Get batch info (counts + total amount)
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
