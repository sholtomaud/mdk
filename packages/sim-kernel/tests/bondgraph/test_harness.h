#ifndef TEST_HARNESS_H
#define TEST_HARNESS_H

/*  Minimal single-header C test framework.
 *  No external dependencies.  Usage:
 *
 *    void test_something(int *_pass, int *_fail) {
 *        ASSERT_TRUE(1 == 1);
 *        ASSERT_EQ(42, 42);
 *    }
 *
 *    int main(void) {
 *        int pass = 0, fail = 0;
 *        RUN_TEST(test_something);
 *        PRINT_RESULTS();
 *        return fail > 0 ? 1 : 0;
 *    }
 */

#include <stdio.h>
#include <string.h>

#define ASSERT_TRUE(expr)                                              \
    do {                                                               \
        (void)_pass;                                                   \
        if (!(expr)) {                                                 \
            printf("  FAIL: %s  (%s:%d)\n", #expr, __FILE__,__LINE__);\
            (*_fail)++; return;                                        \
        }                                                              \
    } while (0)

#define ASSERT_FALSE(expr) ASSERT_TRUE(!(expr))

#define ASSERT_EQ(a, b)                                                \
    do {                                                               \
        (void)_pass;                                                   \
        if ((a) != (b)) {                                              \
            printf("  FAIL: %s == %s  (%s:%d)\n",                     \
                   #a, #b, __FILE__, __LINE__);                        \
            (*_fail)++; return;                                        \
        }                                                              \
    } while (0)

#define ASSERT_STR_EQ(a, b)                                            \
    do {                                                               \
        (void)_pass;                                                   \
        if (strcmp((a), (b)) != 0) {                                   \
            printf("  FAIL: \"%s\" != \"%s\"  (%s:%d)\n",             \
                   (a), (b), __FILE__, __LINE__);                      \
            (*_fail)++; return;                                        \
        }                                                              \
    } while (0)

#define ASSERT_NOT_NULL(ptr)                                           \
    do {                                                               \
        (void)_pass;                                                   \
        if ((ptr) == NULL) {                                           \
            printf("  FAIL: %s is NULL  (%s:%d)\n",                   \
                   #ptr, __FILE__, __LINE__);                          \
            (*_fail)++; return;                                        \
        }                                                              \
    } while (0)

#define RUN_TEST(fn)                                                   \
    do {                                                               \
        printf("  %-50s", #fn);                                        \
        int _before = fail;                                            \
        fn(&pass, &fail);                                              \
        if (fail == _before) { pass++; printf("PASS\n"); }            \
        else                 { printf("\n"); }                         \
    } while (0)

#define PRINT_RESULTS()                                                \
    do {                                                               \
        printf("\n── Results: %d passed, %d failed ──\n", pass, fail); \
    } while (0)

#endif /* TEST_HARNESS_H */
